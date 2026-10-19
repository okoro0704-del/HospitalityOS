import type { FastifyReply, FastifyRequest } from "fastify";
import {
  normalizeStaffRole,
  permissionsForRole,
  staffHasPermission,
  type Permission,
} from "@hospitalityos/shared";
import { requireStaff, type StaffAuth } from "./auth.js";

export { normalizeStaffRole, permissionsForRole, staffHasPermission };
export type { Permission };

/**
 * Fastify preHandler factory: require an authenticated staff session
 * that holds the given permission for their role.
 */
export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    const auth = req.auth as StaffAuth;
    if (!staffHasPermission(auth.role, permission)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Insufficient permission for this action",
      });
    }
  };
}
