import type { FastifyReply, FastifyRequest } from "fastify";
import {
  normalizeStaffRole,
  permissionsForRole,
  type Permission,
  type StaffRole,
} from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { hashToken, parseJsonArray } from "./crypto.js";

export type GuestAuth = {
  kind: "guest";
  sessionId: string;
  tenantId: string;
  customerId: string;
  displayName: string;
  experienceId: string;
  scopes: string[];
  authProvider?: string;
  trustId?: string | null;
};

export type StaffAuth = {
  kind: "staff";
  sessionId: string;
  tenantId: string;
  staffId: string;
  displayName: string;
  role: StaffRole;
  branchIds: string[];
  permissions: Permission[];
  organizationId?: string | null;
  authProvider?: string;
  trustId?: string | null;
};

export type PlatformAuth = {
  kind: "platform";
  sessionId: string;
  adminId: string;
  displayName: string;
  email: string;
};

export type AuthContext = GuestAuth | StaffAuth | PlatformAuth;

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
    tenantId?: string;
  }
}

const GUEST_COOKIE = "hos_guest_session";
const STAFF_COOKIE = "hos_staff_session";
const PLATFORM_COOKIE = "hos_platform_session";

export { GUEST_COOKIE, STAFF_COOKIE, PLATFORM_COOKIE };

function readBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function roleIsAllowed(actual: string, allowed: readonly string[]): boolean {
  const actualNorm = normalizeStaffRole(actual);
  return allowed.some((r) => r === actual || normalizeStaffRole(r) === actualNorm);
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
    authProvider: session.authProvider,
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

  const role = session.role as StaffRole;
  const branchIds = parseJsonArray(session.staff.branchIds);
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { organizationId: true },
  });

  return {
    kind: "staff",
    sessionId: session.id,
    tenantId: session.tenantId,
    staffId: session.staffId,
    displayName: session.staff.displayName,
    role,
    branchIds,
    permissions: permissionsForRole(role),
    organizationId: tenant?.organizationId ?? null,
    authProvider: session.authProvider,
    trustId: session.trustId,
  };
}

export async function resolvePlatformAuth(req: FastifyRequest): Promise<PlatformAuth | null> {
  const token =
    readBearer(req) ??
    (req.cookies?.[PLATFORM_COOKIE] as string | undefined) ??
    null;
  if (!token) return null;

  const session = await prisma.platformAdminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }
  if (session.admin.status !== "active") return null;

  return {
    kind: "platform",
    sessionId: session.id,
    adminId: session.admin.id,
    displayName: session.admin.displayName,
    email: session.admin.email,
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

export async function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply) {
  const auth = await resolvePlatformAuth(req);
  if (!auth) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "Platform admin session required",
    });
  }
  req.auth = auth;
}

export async function requireStaffRoles(
  roles: StaffRole[],
): Promise<(req: FastifyRequest, reply: FastifyReply) => Promise<unknown>> {
  return async (req, reply) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    const auth = req.auth as StaffAuth;
    if (!roleIsAllowed(auth.role, roles)) {
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

export { requirePermission } from "./permissions.js";
