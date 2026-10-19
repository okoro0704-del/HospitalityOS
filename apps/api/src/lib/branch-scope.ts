import type { FastifyReply } from "fastify";
import type { StaffAuth } from "./auth.js";

/** Branch IDs assigned to the staff member (empty = organization-wide). */
export function staffBranchIds(auth: StaffAuth): string[] {
  return auth.branchIds ?? [];
}

/** Empty branchIds means access to all branches in the tenant/organization. */
export function hasOrganizationWideBranchAccess(auth: StaffAuth): boolean {
  return staffBranchIds(auth).length === 0;
}

/**
 * Whether staff may access a resource owned by the given branch.
 * Organization-wide staff always pass. Branch-scoped staff need a matching branchId.
 */
export function canAccessBranch(
  auth: StaffAuth,
  branchId: string | null | undefined,
): boolean {
  if (hasOrganizationWideBranchAccess(auth)) return true;
  if (!branchId) return false;
  return staffBranchIds(auth).includes(branchId);
}

/**
 * Reply 403 when the staff member cannot access the branch.
 * Returns the reply result when denied; undefined when allowed.
 */
export function assertBranchAccess(
  auth: StaffAuth,
  branchId: string | null | undefined,
  reply: FastifyReply,
) {
  if (canAccessBranch(auth, branchId)) return undefined;
  return reply.code(403).send({
    error: "forbidden",
    message: "Branch access denied",
  });
}

/**
 * Prisma-friendly branch filter. Undefined means no filter (org-wide access).
 */
export function branchIdFilter(auth: StaffAuth): undefined | { in: string[] } {
  if (hasOrganizationWideBranchAccess(auth)) return undefined;
  return { in: staffBranchIds(auth) };
}
