import { prisma } from "../db.js";
import { generateSessionToken, hashToken, verifyPassword } from "../lib/crypto.js";
import { writeAudit } from "../lib/audit.js";
import { config } from "../config.js";
import { toStaffPublic, toStaffSessionPublic } from "../lib/mappers.js";

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

  if (!staff || staff.status !== "active" || !verifyPassword(opts.password, staff.passwordHash)) {
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
  });

  return {
    token: rawToken,
    session: toStaffSessionPublic(session),
    staff: toStaffPublic(staff),
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    // Placeholder for future LifeOS Business Portal handoff
    lifeosBusinessPortal: {
      status: "planned",
      note: "Staff auth will integrate with LifeOS Business Portal in a future sprint.",
    },
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
