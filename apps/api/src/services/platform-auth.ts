import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../db.js";
import { generateSessionToken, hashToken, verifyPassword } from "../lib/crypto.js";
import { writeAudit } from "../lib/audit.js";
import { config } from "../config.js";

export async function platformAdminLogin(opts: { email: string; password: string }) {
  const admin = await prisma.platformAdmin.findUnique({
    where: { email: opts.email.toLowerCase() },
  });
  if (!admin || admin.status !== "active" || !verifyPassword(opts.password, admin.passwordHash)) {
    throw Object.assign(new Error("Invalid credentials"), {
      code: "invalid_credentials",
      statusCode: 401,
    });
  }

  const rawToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + config.staffSessionTtlHours * 60 * 60 * 1000);
  const session = await prisma.platformAdminSession.create({
    data: {
      adminId: admin.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  await writeAudit({
    tenantId: null,
    actorKind: "system",
    actorId: admin.id,
    action: "auth.platform.login",
    resource: "platform_admin_session",
    resourceId: session.id,
  });

  return {
    token: rawToken,
    admin: {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
    },
    session: {
      sessionId: session.id,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function revokePlatformSession(sessionId: string) {
  return prisma.platformAdminSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

/** HMAC signature for mock/provider webhooks (hex). */
export function signWebhookPayload(payload: unknown, secret = config.webhookSecret): string {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(
  payload: unknown,
  signature: string | undefined,
  secret = config.webhookSecret,
): boolean {
  if (!signature) return false;
  const expected = signWebhookPayload(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
