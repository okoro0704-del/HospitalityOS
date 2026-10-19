import { isStaffRole, type StaffRole } from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { hashPassword } from "../lib/crypto.js";
import { writeAudit } from "../lib/audit.js";
import { toStaffPublic } from "../lib/mappers.js";
import { stripProtectedFields } from "../lib/protected-fields.js";
import { assertMayManageRole, assertNotLastActiveOwner } from "./staff-privilege.js";

export async function createStaffMember(opts: {
  tenantId: string;
  actorId: string;
  actorRole: string;
  displayName: string;
  email: string;
  password?: string;
  trustId?: string;
  role: string;
  branchIds?: string[];
}) {
  if (!isStaffRole(opts.role)) {
    throw Object.assign(new Error(`Invalid role: ${opts.role}`), {
      code: "validation_error",
      statusCode: 400,
    });
  }
  assertMayManageRole(opts.actorRole, opts.role);
  if (!opts.password && !opts.trustId) {
    throw Object.assign(new Error("Staff requires a password or TrustID link"), {
      code: "validation_error",
      statusCode: 400,
    });
  }
  if (opts.trustId && !opts.trustId.startsWith("TID-")) {
    throw Object.assign(new Error("trustId must be a TID-… identity reference"), {
      code: "validation_error",
      statusCode: 400,
    });
  }
  if (opts.branchIds?.length) {
    const branches = await prisma.branch.findMany({
      where: { tenantId: opts.tenantId, id: { in: opts.branchIds } },
      select: { id: true },
    });
    if (branches.length !== opts.branchIds.length) {
      throw Object.assign(new Error("One or more branches are invalid for this tenant"), {
        code: "validation_error",
        statusCode: 400,
      });
    }
  }

  if (opts.trustId) {
    const linked = await prisma.staffMember.findFirst({
      where: {
        tenantId: opts.tenantId,
        OR: [{ trustId: opts.trustId }, { externalIdentityRef: opts.trustId }],
      },
    });
    if (linked) {
      throw Object.assign(new Error("This TrustID is already linked to a staff member"), {
        code: "conflict",
        statusCode: 409,
      });
    }
  }

  const staff = await prisma.staffMember.create({
    data: {
      tenantId: opts.tenantId,
      displayName: opts.displayName.trim(),
      email: opts.email.toLowerCase().trim(),
      passwordHash: opts.password ? hashPassword(opts.password) : null,
      trustId: opts.trustId ?? null,
      externalIdentityRef: opts.trustId ?? null,
      role: opts.role,
      branchIds: opts.branchIds ?? [],
      status: "active",
    },
  });

  if (opts.trustId) {
    await prisma.staffIdentityLink.create({
      data: {
        tenantId: opts.tenantId,
        staffId: staff.id,
        trustId: opts.trustId,
        status: "active",
        linkedByStaffId: opts.actorId,
        verifiedAt: new Date(),
        metadata: {},
      },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    action: "staff.created",
    resource: "staff_member",
    resourceId: staff.id,
    metadata: { role: staff.role, email: staff.email, trustId: staff.trustId },
  });

  return toStaffPublic(staff);
}

/** Explicitly link an existing staff membership to a TrustID identity. Auth ≠ authz. */
export { linkStaffTrustId, unlinkStaffTrustId } from "./staff-identity.js";

export async function updateStaffMember(opts: {
  tenantId: string;
  staffId: string;
  actorId: string;
  actorRole: string;
  rawBody: Record<string, unknown>;
}) {
  const existing = await prisma.staffMember.findFirst({
    where: { id: opts.staffId, tenantId: opts.tenantId },
  });
  if (!existing) {
    throw Object.assign(new Error("Staff not found"), { code: "not_found", statusCode: 404 });
  }
  const self = existing.id === opts.actorId;
  if (self && (opts.rawBody.role !== undefined || opts.rawBody.status !== undefined)) {
    throw Object.assign(new Error("You cannot change your own role or status"), {
      code: "forbidden",
      statusCode: 403,
    });
  }
  if (!self) assertMayManageRole(opts.actorRole, existing.role);

  // Mass-assignment protection: only allow known safe fields from a stripped body.
  const safe = stripProtectedFields(opts.rawBody);
  const data: {
    displayName?: string;
    email?: string;
    role?: string;
    status?: string;
    branchIds?: string[];
    passwordHash?: string;
  } = {};

  if (typeof safe.displayName === "string" && safe.displayName.trim()) {
    data.displayName = safe.displayName.trim();
  }
  if (typeof safe.email === "string" && safe.email.trim()) {
    data.email = safe.email.toLowerCase().trim();
  }
  // role / status / branchIds / password are set explicitly only via dedicated keys
  // after authorization — never from arbitrary body injection of tenantId etc.
  if (typeof opts.rawBody.role === "string") {
    if (!isStaffRole(opts.rawBody.role)) {
      throw Object.assign(new Error(`Invalid role: ${opts.rawBody.role}`), {
        code: "validation_error",
        statusCode: 400,
      });
    }
    assertMayManageRole(opts.actorRole, opts.rawBody.role);
    data.role = opts.rawBody.role;
  }
  if (typeof opts.rawBody.status === "string" && ["active", "disabled", "invited"].includes(opts.rawBody.status)) {
    data.status = opts.rawBody.status;
  }
  if (Array.isArray(opts.rawBody.branchIds)) {
    const branchIds = opts.rawBody.branchIds.map(String);
    if (branchIds.length) {
      const branches = await prisma.branch.findMany({
        where: { tenantId: opts.tenantId, id: { in: branchIds } },
        select: { id: true },
      });
      if (branches.length !== branchIds.length) {
        throw Object.assign(new Error("One or more branches are invalid for this tenant"), {
          code: "validation_error",
          statusCode: 400,
        });
      }
    }
    data.branchIds = branchIds;
  }
  if (typeof opts.rawBody.password === "string" && opts.rawBody.password.length >= 8) {
    data.passwordHash = hashPassword(opts.rawBody.password);
  }
  if ((data.role && data.role !== "owner") || (data.status && data.status !== "active")) {
    await assertNotLastActiveOwner(opts.tenantId, existing);
  }

  const staff = await prisma.staffMember.update({
    where: { id: existing.id },
    data,
  });

  // Sessions carry the role they were issued with; end them when the role,
  // status or password changes so the change takes effect immediately.
  const roleChanged = data.role !== undefined && data.role !== existing.role;
  const statusChanged = data.status !== undefined && data.status !== existing.status;
  if (roleChanged || statusChanged || data.passwordHash) {
    await prisma.staffSession.updateMany({
      where: { staffId: staff.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    action: data.role && data.role !== existing.role ? "staff.role_changed" : "staff.updated",
    resource: "staff_member",
    resourceId: staff.id,
    metadata: {
      previousRole: existing.role,
      role: staff.role,
      status: staff.status,
    },
  });

  return toStaffPublic(staff);
}

export async function deactivateStaffMember(opts: {
  tenantId: string;
  staffId: string;
  actorId: string;
  actorRole: string;
}) {
  if (opts.staffId === opts.actorId) {
    throw Object.assign(new Error("Cannot deactivate your own account"), {
      code: "conflict",
      statusCode: 409,
    });
  }
  const existing = await prisma.staffMember.findFirst({
    where: { id: opts.staffId, tenantId: opts.tenantId },
  });
  if (!existing) {
    throw Object.assign(new Error("Staff not found"), { code: "not_found", statusCode: 404 });
  }
  assertMayManageRole(opts.actorRole, existing.role);
  await assertNotLastActiveOwner(opts.tenantId, existing);

  const staff = await prisma.staffMember.update({
    where: { id: existing.id },
    data: { status: "disabled" },
  });

  await prisma.staffSession.updateMany({
    where: { staffId: staff.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    action: "staff.deactivated",
    resource: "staff_member",
    resourceId: staff.id,
  });

  return toStaffPublic(staff);
}

export type { StaffRole };
