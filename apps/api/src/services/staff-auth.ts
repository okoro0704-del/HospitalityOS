import { prisma } from "../db.js";
import { generateSessionToken, hashToken, verifyPassword } from "../lib/crypto.js";
import { writeAudit } from "../lib/audit.js";
import { config } from "../config.js";
import { toStaffPublic, toStaffSessionPublic } from "../lib/mappers.js";
import { findStaffByTrustId } from "./staff-identity.js";

/**
 * LEGACY / DEVELOPMENT AUTHENTICATION.
 * Prefer TrustID assertion exchange. Password login must never bypass
 * HospitalityOS role/branch authorization — it only establishes identity
 * for an already-authorized StaffMember.
 */
export async function staffLogin(opts: {
  tenantSlug: string;
  email: string;
  password: string;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: opts.tenantSlug } });
  if (!tenant || tenant.status !== "active") {
    throw Object.assign(new Error("Invalid credentials"), {
      code: "invalid_credentials",
      statusCode: 401,
    });
  }

  const staff = await prisma.staffMember.findUnique({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: opts.email.toLowerCase(),
      },
    },
  });

  if (!staff || staff.status !== "active") {
    throw Object.assign(new Error("Invalid credentials"), {
      code: "invalid_credentials",
      statusCode: 401,
    });
  }
  if (!staff.passwordHash || !verifyPassword(opts.password, staff.passwordHash)) {
    throw Object.assign(new Error("Invalid credentials"), {
      code: "invalid_credentials",
      statusCode: 401,
    });
  }

  const rawToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + config.staffSessionTtlHours * 60 * 60 * 1000);

  const session = await prisma.staffSession.create({
    data: {
      tenantId: tenant.id,
      staffId: staff.id,
      tokenHash: hashToken(rawToken),
      role: staff.role,
      authProvider: "legacy_password",
      stepUpAt: {},
      expiresAt,
    },
    include: { staff: true },
  });

  await writeAudit({
    tenantId: tenant.id,
    actorKind: "staff",
    actorId: staff.id,
    action: "auth.staff.login",
    resource: "staff_session",
    resourceId: session.id,
    metadata: { authProvider: "legacy_password", legacy: true, classification: "LEGACY_DEVELOPMENT" },
  });

  return {
    token: rawToken,
    session: toStaffSessionPublic(session),
    staff: toStaffPublic(staff),
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    authProvider: "legacy_password" as const,
    authClassification: "LEGACY_DEVELOPMENT" as const,
    preferredAuth: "trustid",
    trustIdPreferred: {
      status: "preferred",
      exchangePath: "/auth/staff/trustid/exchange",
      note: "TrustID is the preferred staff login. Password auth is legacy/development only.",
    },
  };
}

/**
 * Preferred staff authentication via TrustID.
 * Requires StaffIdentityLink (or denormalized trustId) — never auto-grants access.
 */
export async function staffLoginWithTrustId(opts: {
  tenantSlug: string;
  assertion: string;
  jwksUrl?: string;
  trustidApiUrl?: string;
}) {
  const {
    verifyTrustIdAssertion,
    markAssertionConsumed,
    introspectTrustIdSession,
    consumeTrustIdAssertion,
  } = await import("../lib/trustid.js");
  const { config: cfg } = await import("../config.js");

  const tenant = await prisma.tenant.findUnique({ where: { slug: opts.tenantSlug } });
  if (!tenant || tenant.status !== "active") {
    throw Object.assign(new Error("Tenant not found"), {
      code: "tenant_not_found",
      statusCode: 404,
    });
  }

  const verified = await verifyTrustIdAssertion({
    assertion: opts.assertion,
    expectedAudience: cfg.trustidAudience,
    jwksUrl: opts.jwksUrl,
    expectedAssertionType: "authentication",
    requiredScopes: ["openid"],
  });
  if (!verified.ok) {
    throw Object.assign(new Error(verified.message), {
      code: verified.code,
      statusCode: 401,
    });
  }

  const intro = await introspectTrustIdSession(verified.claims.jti, opts.trustidApiUrl);
  if (!intro.active) {
    throw Object.assign(new Error("TrustID session is no longer valid"), {
      code: intro.reason === "revoked" ? "revoked" : "token_expired",
      statusCode: 401,
    });
  }

  const consumed = await consumeTrustIdAssertion(verified.claims.jti, opts.trustidApiUrl);
  if (!consumed.ok && consumed.code === "replay") {
    throw Object.assign(new Error("Assertion has already been used"), {
      code: "replay",
      statusCode: 401,
    });
  }

  markAssertionConsumed(verified.claims.jti, verified.claims.exp);

  await prisma.assertionExchange.create({
    data: {
      jti: verified.claims.jti,
      trustId: verified.claims.sub,
      purpose: "staff_login",
      tenantId: tenant.id,
      expiresAt: new Date(verified.claims.exp * 1000 + 300_000),
    },
  }).catch(async (err) => {
    if ((err as { code?: string }).code === "P2002") {
      throw Object.assign(new Error("Assertion has already been used"), {
        code: "replay",
        statusCode: 401,
      });
    }
    throw err;
  });

  const tid = verified.claims.sub;
  const resolved = await findStaffByTrustId(tenant.id, tid);
  if (!resolved) {
    throw Object.assign(
      new Error("This TrustID is not a staff member of this business"),
      { code: "not_staff", statusCode: 403 },
    );
  }
  const { staff } = resolved;

  const rawToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + config.staffSessionTtlHours * 60 * 60 * 1000);
  const session = await prisma.staffSession.create({
    data: {
      tenantId: tenant.id,
      staffId: staff.id,
      tokenHash: hashToken(rawToken),
      role: staff.role,
      authProvider: "trustid",
      trustJti: verified.claims.jti,
      trustSid: verified.claims.sid,
      trustId: tid,
      stepUpAt: {},
      expiresAt,
    },
    include: { staff: true },
  });

  await writeAudit({
    tenantId: tenant.id,
    actorKind: "staff",
    actorId: staff.id,
    action: "auth.staff.trustid_login",
    resource: "staff_session",
    resourceId: session.id,
    metadata: { trustId: tid, jti: verified.claims.jti, authProvider: "trustid" },
  });

  const { attachDigiContext } = await import("./pdi/session.js");
  await attachDigiContext({
    assertion: opts.assertion,
    tenantId: tenant.id,
    actorKind: "staff",
    actorId: staff.id,
    hospitalitySessionId: session.id,
    trustIdSubject: tid,
  }).catch(() => undefined);

  return {
    token: rawToken,
    session: toStaffSessionPublic(session),
    staff: toStaffPublic(staff),
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    trustId: tid,
    authProvider: "trustid" as const,
    identity: verified.identity,
  };
}

export async function revokeStaffSession(sessionId: string, tenantId: string) {
  const session = await prisma.staffSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) return null;
  return prisma.staffSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
}
