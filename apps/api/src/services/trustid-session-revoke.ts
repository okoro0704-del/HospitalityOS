import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { writeAudit } from "../lib/audit.js";

/**
 * Invalidate HospitalityOS sessions correlated to a TrustID session revoke.
 * TrustID owns IdP session state; HOS owns local sessions and applies the contract.
 */
export async function revokeHosSessionsForTrustId(opts: {
  trustId?: string;
  jti?: string;
  sid?: string;
  reason?: string;
}) {
  const guestWhere = [];
  const staffWhere = [];

  if (opts.jti) {
    guestWhere.push({ lifeosJti: opts.jti });
    staffWhere.push({ trustJti: opts.jti });
  }
  if (opts.sid) {
    guestWhere.push({ lifeosSid: opts.sid });
    staffWhere.push({ trustSid: opts.sid });
  }
  if (opts.trustId) {
    staffWhere.push({ trustId: opts.trustId });
  }

  let guestCount = 0;
  let staffCount = 0;

  if (guestWhere.length) {
    const r = await prisma.guestSession.updateMany({
      where: { revokedAt: null, OR: guestWhere },
      data: { revokedAt: new Date() },
    });
    guestCount = r.count;
  }
  if (staffWhere.length) {
    const r = await prisma.staffSession.updateMany({
      where: { revokedAt: null, OR: staffWhere },
      data: { revokedAt: new Date() },
    });
    staffCount = r.count;
  }

  await writeAudit({
    tenantId: null,
    actorKind: "system",
    actorId: "trustid",
    action: "auth.trustid.session_revoked",
    resource: "session",
    resourceId: opts.jti ?? opts.sid ?? opts.trustId ?? "unknown",
    metadata: {
      reason: opts.reason ?? "trustid_revoke",
      guestSessions: guestCount,
      staffSessions: staffCount,
      trustId: opts.trustId,
    },
  }).catch(() => undefined);

  return { guestSessions: guestCount, staffSessions: staffCount };
}

export function verifyTrustIdWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const secret = config.webhookSecret;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
