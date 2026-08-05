import type { FastifyReply, FastifyRequest } from "fastify";
import type { StaffRole } from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { hashToken } from "./crypto.js";

export type GuestAuth = {
  kind: "guest";
  sessionId: string;
  tenantId: string;
  customerId: string;
  displayName: string;
  experienceId: string;
  scopes: string[];
};

export type StaffAuth = {
  kind: "staff";
  sessionId: string;
  tenantId: string;
  staffId: string;
  displayName: string;
  role: StaffRole;
};

export type AuthContext = GuestAuth | StaffAuth;

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
    tenantId?: string;
  }
}

const GUEST_COOKIE = "hos_guest_session";
const STAFF_COOKIE = "hos_staff_session";

export { GUEST_COOKIE, STAFF_COOKIE };

function readBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function resolveGuestAuth(req: FastifyRequest): Promise<GuestAuth | null> {
  const token =
    readBearer(req) ??
    (req.cookies?.[GUEST_COOKIE] as string | undefined) ??
    null;
  if (!token) return null;

  const session = await prisma.guestSession.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  return {
    kind: "guest",
    sessionId: session.id,
    tenantId: session.tenantId,
    customerId: session.customerId,
    displayName: session.displayName,
    experienceId: session.experienceId,
    scopes: Array.isArray(session.scopes) ? session.scopes.map(String) : [],
  };
}

export async function resolveStaffAuth(req: FastifyRequest): Promise<StaffAuth | null> {
  const token =
    readBearer(req) ??
    (req.cookies?.[STAFF_COOKIE] as string | undefined) ??
    null;
  if (!token) return null;

  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { staff: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }
  if (session.staff.status !== "active") return null;

  return {
    kind: "staff",
    sessionId: session.id,
    tenantId: session.tenantId,
    staffId: session.staffId,
    displayName: session.staff.displayName,
    role: session.role as StaffRole,
  };
}

export async function requireGuest(req: FastifyRequest, reply: FastifyReply) {
  const auth = await resolveGuestAuth(req);
  if (!auth) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "Guest session required",
    });
  }
  req.auth = auth;
  req.tenantId = auth.tenantId;
}

export async function requireStaff(req: FastifyRequest, reply: FastifyReply) {
  const auth = await resolveStaffAuth(req);
  if (!auth) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "Staff session required",
    });
  }
  req.auth = auth;
  req.tenantId = auth.tenantId;
}

export async function requireStaffRoles(
  roles: StaffRole[],
): Promise<(req: FastifyRequest, reply: FastifyReply) => Promise<unknown>> {
  return async (req, reply) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    const auth = req.auth as StaffAuth;
    if (!roles.includes(auth.role)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Insufficient role for this action",
      });
    }
  };
}

/**
 * Enforce that a resource belongs to the authenticated tenant.
 * Cross-tenant access returns 404 (does not leak existence).
 */
export function assertSameTenant(
  resourceTenantId: string | null | undefined,
  authTenantId: string,
): boolean {
  return Boolean(resourceTenantId && resourceTenantId === authTenantId);
}

export function tenantNotFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: "not_found",
    message: "Resource not found",
  });
}
