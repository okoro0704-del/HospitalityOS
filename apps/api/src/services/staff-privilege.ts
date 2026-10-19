import { prisma } from "../db.js";

/** owner > admin/administrator > every other role. */
function roleTier(role: string): number {
  if (role === "owner") return 2;
  if (role === "admin" || role === "administrator") return 1;
  return 0;
}

/**
 * Staff management must not be a way to gain or take over a privileged account.
 * Members with ordinary roles can be created, changed, deactivated or re-linked
 * by anyone the route's permission admits; owner and admin memberships — and
 * granting those roles — are reserved to owners.
 */
export function assertMayManageRole(actorRole: string, role: string) {
  if (roleTier(role) === 0 || roleTier(actorRole) === 2) return;
  throw Object.assign(new Error("Your role cannot manage staff with this role"), {
    code: "forbidden",
    statusCode: 403,
  });
}

/** A tenant always keeps at least one active owner. */
export async function assertNotLastActiveOwner(
  tenantId: string,
  staff: { role: string; status: string },
) {
  if (staff.role !== "owner" || staff.status !== "active") return;
  const owners = await prisma.staffMember.count({ where: { tenantId, role: "owner", status: "active" } });
  if (owners <= 1) {
    throw Object.assign(new Error("The last active owner cannot be demoted or deactivated"), {
      code: "last_owner",
      statusCode: 409,
    });
  }
}
