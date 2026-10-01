import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { toStaffPublic } from "../lib/mappers.js";

/**
 * Resolve staff membership for a TrustID subject within a tenant.
 * Authentication ≠ authorization — missing/disabled link → null (caller → 403).
 */
export async function findStaffByTrustId(tenantId: string, trustId: string) {
  const link = await prisma.staffIdentityLink.findFirst({
    where: {
      tenantId,
      trustId,
      status: "active",
      revokedAt: null,
    },
    include: { staff: true },
  });
  if (link?.staff && link.staff.status === "active") {
    return { staff: link.staff, link };
  }

  // Back-compat: denormalized columns on StaffMember (pre-StaffIdentityLink)
  const staff = await prisma.staffMember.findFirst({
    where: {
      tenantId,
      status: "active",
      OR: [{ trustId }, { externalIdentityRef: trustId }],
    },
  });
  if (!staff) return null;
  return { staff, link: null };
}

/** Explicit verified link — never auto-link by email match. */
export async function linkStaffTrustId(opts: {
  tenantId: string;
  staffId: string;
  actorId: string;
  trustId: string;
}) {
  if (!opts.trustId.startsWith("TID-")) {
    throw Object.assign(new Error("trustId must be a TID-… identity reference"), {
      code: "validation_error",
      statusCode: 400,
    });
  }
  const existing = await prisma.staffMember.findFirst({
    where: { id: opts.staffId, tenantId: opts.tenantId },
  });
  if (!existing) {
    throw Object.assign(new Error("Staff not found"), { code: "not_found", statusCode: 404 });
  }

  const conflict = await prisma.staffIdentityLink.findFirst({
    where: {
      tenantId: opts.tenantId,
      OR: [{ trustId: opts.trustId }, { staffId: opts.staffId }],
      status: "active",
      revokedAt: null,
    },
  });
  if (conflict && conflict.staffId !== opts.staffId) {
    throw Object.assign(new Error("This TrustID is already linked to a staff member"), {
      code: "conflict",
      statusCode: 409,
    });
  }
  if (conflict && conflict.trustId !== opts.trustId && conflict.staffId === opts.staffId) {
    throw Object.assign(new Error("Staff already has a different TrustID link"), {
      code: "conflict",
      statusCode: 409,
    });
  }

  const otherStaff = await prisma.staffMember.findFirst({
    where: {
      tenantId: opts.tenantId,
      id: { not: opts.staffId },
      OR: [{ trustId: opts.trustId }, { externalIdentityRef: opts.trustId }],
    },
  });
  if (otherStaff) {
    throw Object.assign(new Error("This TrustID is already linked to a staff member"), {
      code: "conflict",
      statusCode: 409,
    });
  }

  const link = await prisma.staffIdentityLink.upsert({
    where: { tenantId_staffId: { tenantId: opts.tenantId, staffId: opts.staffId } },
    create: {
      tenantId: opts.tenantId,
      staffId: opts.staffId,
      trustId: opts.trustId,
      status: "active",
      linkedByStaffId: opts.actorId,
      verifiedAt: new Date(),
      metadata: {},
    },
    update: {
      trustId: opts.trustId,
      status: "active",
      revokedAt: null,
      linkedByStaffId: opts.actorId,
      verifiedAt: new Date(),
    },
  });

  const staff = await prisma.staffMember.update({
    where: { id: existing.id },
    data: {
      trustId: opts.trustId,
      externalIdentityRef: opts.trustId,
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    action: "staff.trustid_linked",
    resource: "staff_identity_link",
    resourceId: link.id,
    metadata: { trustId: opts.trustId, staffId: staff.id },
  });

  return { staff: toStaffPublic(staff), link };
}

export async function unlinkStaffTrustId(opts: {
  tenantId: string;
  staffId: string;
  actorId: string;
}) {
  const existing = await prisma.staffMember.findFirst({
    where: { id: opts.staffId, tenantId: opts.tenantId },
  });
  if (!existing) {
    throw Object.assign(new Error("Staff not found"), { code: "not_found", statusCode: 404 });
  }

  await prisma.staffIdentityLink.updateMany({
    where: { tenantId: opts.tenantId, staffId: opts.staffId, status: "active" },
    data: { status: "revoked", revokedAt: new Date() },
  });

  const staff = await prisma.staffMember.update({
    where: { id: existing.id },
    data: { trustId: null, externalIdentityRef: null },
  });

  await prisma.staffSession.updateMany({
    where: { staffId: staff.id, revokedAt: null, authProvider: "trustid" },
    data: { revokedAt: new Date() },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    action: "staff.trustid_unlinked",
    resource: "staff_member",
    resourceId: staff.id,
  });

  return toStaffPublic(staff);
}
