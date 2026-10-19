/** Fields that must never be mass-assigned from client request bodies. */
export const PROTECTED_BODY_FIELDS = [
  "tenantId",
  "organizationId",
  "branchId",
  "role",
  "permissions",
  "createdBy",
  "approvedBy",
  "passwordHash",
  "staffId",
  "actorId",
  "collector",
  "collectedByStaffId",
  "verifiedByStaffId",
  "authorizedByStaffId",
  "processedByStaffId",
  "lifeosUserId",
  "lifeosStaffId",
  "lifeosBusinessId",
  "lifeosJti",
  "lifeosSid",
  "trustId",
  "externalIdentityRef",
  "tokenHash",
  "authProvider",
  "trustJti",
  "trustSid",
  "stepUpAt",
  "createdAt",
  "updatedAt",
  "revokedAt",
  "deletedAt",
  "status",
] as const;

export type ProtectedBodyField = (typeof PROTECTED_BODY_FIELDS)[number];

/**
 * Strip protected / privilege fields from a request body before persistence.
 * Returns a shallow copy; does not mutate the input.
 */
export function stripProtectedFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const key of PROTECTED_BODY_FIELDS) {
    delete out[key];
  }
  return out;
}
