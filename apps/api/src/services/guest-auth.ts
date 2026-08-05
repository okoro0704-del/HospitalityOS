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
