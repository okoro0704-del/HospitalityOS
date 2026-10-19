import { staffHasPermission, type Permission } from "@hospitalityos/shared";

/** Nav item may require one of these permissions (any match). */
export type NavPermission = Permission | Permission[];

export function canSeeNav(role: string | undefined, required?: NavPermission): boolean {
  if (!required) return true;
  if (!role) return false;
  const needed = Array.isArray(required) ? required : [required];
  return needed.some((p) => staffHasPermission(role, p));
}
