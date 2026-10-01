import { prisma } from "../db.js";
import { generateSessionToken, hashToken } from "../lib/crypto.js";
import {
  exchangeLifeOsHandoff,
  introspectLifeOsJti,
  verifyExperienceToken,
} from "../lib/lifeos.js";
import { writeAudit } from "../lib/audit.js";
import { config } from "../config.js";
import { toCustomerPublic, toGuestSessionPublic } from "../lib/mappers.js";

export async function createGuestSessionFromHandoff(opts: {
  handoff: string;
  experienceId: string;
  /** Optional overrides for tests */
  lifeosApiUrl?: string;
  jwksUrl?: string;
  /** When set, skip remote LifeOS exchange and use this pre-verified token path */
  preVerifiedToken?: string;
}) {
  let token: string;

  if (opts.preVerifiedToken) {
    token = opts.preVerifiedToken;
  } else {
    const exchanged = await exchangeLifeOsHandoff({
      handoff: opts.handoff,
      experienceId: opts.experienceId,
      lifeosApiUrl: opts.lifeosApiUrl,
    });
    token = exchanged.token;
  }

  const verified = await verifyExperienceToken({
    token,
    expectedAudience: opts.experienceId,
    jwksUrl: opts.jwksUrl,
  });
  if (!verified.ok) {
    throw Object.assign(new Error(verified.message), {
      code: verified.code,
      statusCode: 401,
    });
  }

  const intro = await introspectLifeOsJti(verified.claims.jti, opts.lifeosApiUrl);
  if (!intro.active) {
    throw Object.assign(
      new Error(
        intro.reason === "revoked"
          ? "This experience session is no longer valid."
          : "This experience session has expired. Reopen the experience.",
      ),
      {
        code: intro.reason === "revoked" ? "revoked" : "token_expired",
        statusCode: 401,
      },
    );
  }

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { experienceId: opts.experienceId },
        { experienceId: verified.claims.experience_id },
        { lifeosBusinessId: verified.claims.business_id },
      ],
      status: "active",
    },
  });

  if (!tenant) {
    throw Object.assign(new Error("No HospitalityOS tenant mapped to this experience"), {
      code: "tenant_not_found",
      statusCode: 404,
    });
  }

  if (tenant.experienceId && tenant.experienceId !== verified.claims.experience_id) {
    throw Object.assign(new Error("This experience cannot use this session."), {
      code: "wrong_audience",
      statusCode: 401,
    });
  }

  const displayName = verified.claims.display_name ?? "Guest";
  const customer = await prisma.customer.upsert({
    where: {
      tenantId_lifeosUserId: {
        tenantId: tenant.id,
        lifeosUserId: verified.claims.sub,
      },
    },
    create: {
      tenantId: tenant.id,
      displayName,
      lifeosUserId: verified.claims.sub,
      status: "active",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
    update: {
      displayName,
      status: "active",
    },
  });

  const rawToken = generateSessionToken();
  const expiresAt = new Date(verified.claims.exp * 1000);
  // Cap by local TTL while still respecting LifeOS exp
  const localCap = new Date(Date.now() + config.guestSessionTtlHours * 60 * 60 * 1000);
  const finalExpiry = expiresAt < localCap ? expiresAt : localCap;

  const session = await prisma.guestSession.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      tokenHash: hashToken(rawToken),
      experienceId: verified.claims.experience_id,
      lifeosJti: verified.claims.jti,
      lifeosSid: verified.claims.sid,
      scopes: verified.claims.scopes,
      displayName,
      expiresAt: finalExpiry,
    },
  });

  await writeAudit({
    tenantId: tenant.id,
    actorKind: "guest",
    actorId: customer.id,
    action: "auth.guest.session_created",
    resource: "guest_session",
    resourceId: session.id,
    metadata: { experienceId: verified.claims.experience_id, jti: verified.claims.jti },
  });

  return {
    token: rawToken,
    session: toGuestSessionPublic(session),
    customer: toCustomerPublic(customer),
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  };
}

/**
 * Demo / local guest entry — does NOT use TrustID or LifeOS.
 * Creates a HospitalityOS-only guest session for a tenant slug.
 */
export async function createDemoGuestSession(opts: {
  tenantSlug: string;
  displayName?: string;
}) {
  if (!config.allowDemoGuest) {
    throw Object.assign(new Error("Demo guest entry is disabled"), {
      code: "demo_disabled",
      statusCode: 403,
    });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { slug: opts.tenantSlug, status: "active" },
  });
  if (!tenant) {
    throw Object.assign(new Error("Venue not found"), {
      code: "tenant_not_found",
      statusCode: 404,
    });
  }

  const displayName = opts.displayName?.trim() || "Demo Guest";
  const demoUserId = `demo_${tenant.slug}`;

  const customer = await prisma.customer.upsert({
    where: {
      tenantId_lifeosUserId: {
        tenantId: tenant.id,
        lifeosUserId: demoUserId,
      },
    },
    create: {
      tenantId: tenant.id,
      displayName,
      lifeosUserId: demoUserId,
      status: "active",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: { demo: true },
    },
    update: {
      displayName,
      status: "active",
    },
  });

  const rawToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + config.guestSessionTtlHours * 60 * 60 * 1000);
  const jti = `demo_jti_${Date.now()}`;
  const sid = `demo_sid_${tenant.slug}`;

  const session = await prisma.guestSession.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      tokenHash: hashToken(rawToken),
      experienceId: tenant.experienceId ?? `exp_demo_${tenant.slug}`,
      lifeosJti: jti,
      lifeosSid: sid,
      scopes: ["profile.basic", "notifications", "demo"],
      displayName,
      expiresAt,
    },
  });

  await writeAudit({
    tenantId: tenant.id,
    actorKind: "guest",
    actorId: customer.id,
    action: "auth.guest.demo_session_created",
    resource: "guest_session",
    resourceId: session.id,
    metadata: { demo: true, tenantSlug: tenant.slug },
  });

  return {
    token: rawToken,
    session: toGuestSessionPublic(session),
    customer: toCustomerPublic(customer),
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  };
}

/**
 * Guest / customer authentication via TrustID assertion.
 * Creates or links a tenant-scoped Customer with externalIdentityRef = TID-…
 * Does NOT create a shared customer DB — each tenant owns its profile.
 */
export async function createGuestSessionFromTrustId(opts: {
  assertion: string;
  tenantSlug: string;
  jwksUrl?: string;
  trustidApiUrl?: string;
}) {
  const { verifyTrustIdAssertion, markAssertionConsumed, introspectTrustIdSession, consumeTrustIdAssertion } =
    await import("../lib/trustid.js");

  const verified = await verifyTrustIdAssertion({
    assertion: opts.assertion,
    expectedAudience: config.trustidAudience,
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
      purpose: "guest_login",
      tenantId: null,
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

  const tenant = await prisma.tenant.findFirst({
    where: { slug: opts.tenantSlug, status: "active" },
  });
  if (!tenant) {
    throw Object.assign(new Error("Tenant not found"), {
      code: "tenant_not_found",
      statusCode: 404,
    });
  }

  // Re-bind exchange to tenant (privacy: lookup always tenant-scoped)
  await prisma.assertionExchange.update({
    where: { jti: verified.claims.jti },
    data: { tenantId: tenant.id },
  }).catch(() => undefined);

  const tid = verified.claims.sub;
  const displayName = verified.claims.display_name ?? "Guest";

  // Tenant-scoped only — never enumerate other tenants' customer links
  let customer = await prisma.customer.findFirst({
    where: {
      tenantId: tenant.id,
      OR: [{ trustId: tid }, { externalIdentityRef: tid }],
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        displayName,
        trustId: tid,
        externalIdentityRef: tid,
        status: "active",
        preferences: {},
        loyaltyPlaceholder: {},
        metadata: { authProvider: "trustid" },
      },
    });
  } else {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        displayName,
        trustId: tid,
        externalIdentityRef: tid,
        status: "active",
      },
    });
  }

  const rawToken = generateSessionToken();
  const finalExpiry = new Date(Date.now() + config.guestSessionTtlHours * 60 * 60 * 1000);

  const session = await prisma.guestSession.create({
    data: {
      tenantId: tenant.id,
      customerId: customer.id,
      tokenHash: hashToken(rawToken),
      experienceId: `trustid:${tenant.slug}`,
      lifeosJti: verified.claims.jti,
      lifeosSid: verified.claims.sid,
      scopes: verified.claims.scopes,
      displayName,
      authProvider: "trustid",
      expiresAt: finalExpiry,
    },
  });

  await writeAudit({
    tenantId: tenant.id,
    actorKind: "guest",
    actorId: customer.id,
    action: "auth.guest.trustid_session_created",
    resource: "guest_session",
    resourceId: session.id,
    metadata: { trustId: tid, jti: verified.claims.jti, authProvider: "trustid" },
  });

  const { attachDigiContext } = await import("./pdi/session.js");
  await attachDigiContext({
    assertion: opts.assertion,
    tenantId: tenant.id,
    actorKind: "guest",
    actorId: customer.id,
    hospitalitySessionId: session.id,
    trustIdSubject: tid,
  }).catch(() => undefined);

  return {
    token: rawToken,
    session: toGuestSessionPublic(session),
    customer: toCustomerPublic(customer),
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    trustId: tid,
    authProvider: "trustid" as const,
    identity: verified.identity,
  };
}

export async function revokeGuestSession(sessionId: string, tenantId: string) {
  const session = await prisma.guestSession.findFirst({
    where: { id: sessionId, tenantId },
  });
  if (!session) return null;
  return prisma.guestSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
}
