import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireStaff, type StaffAuth } from "./lib/auth.js";
import { requirePermission } from "./lib/permissions.js";
import {
  getBusinessOverview,
  getOperationsToday,
  resolveStaffCommand,
  settingsSectionsForRole,
  staffOperationalSearch,
} from "./services/operations-today.js";

function mapErr(err: unknown) {
  const e = err as { statusCode?: number; code?: string; message?: string };
  return {
    status: e.statusCode ?? 500,
    body: { error: e.code ?? "internal_error", message: e.message ?? "Unexpected error" },
  };
}

export async function registerOperationsTodayRoutes(app: FastifyInstance) {
  app.get("/operations/today", { preHandler: requireStaff }, async (req, reply) => {
    const q = req.query as { day?: string; branchId?: string };
    const auth = req.auth as StaffAuth;
    try {
      const today = await getOperationsToday({
        tenantId: req.tenantId!,
        auth,
        day: q.day ? new Date(q.day) : undefined,
        branchId: q.branchId,
      });
      return { today };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/operations/overview", { preHandler: requireStaff }, async (req, reply) => {
    const q = req.query as { day?: string; branchId?: string };
    const auth = req.auth as StaffAuth;
    try {
      const overview = await getBusinessOverview({
        tenantId: req.tenantId!,
        auth,
        day: q.day ? new Date(q.day) : undefined,
        branchId: q.branchId,
      });
      return { overview };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/operations/search", { preHandler: requireStaff }, async (req, reply) => {
    const q = z
      .object({
        q: z.string().min(1),
        branchId: z.string().optional(),
      })
      .parse(req.query);
    const auth = req.auth as StaffAuth;
    try {
      const result = await staffOperationalSearch({
        tenantId: req.tenantId!,
        auth,
        q: q.q,
        branchId: q.branchId,
      });
      return result;
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/operations/command", { preHandler: requireStaff }, async (req) => {
    const body = z.object({ query: z.string().min(1) }).parse(req.body);
    const command = resolveStaffCommand(body.query);
    return { command };
  });

  app.get("/staff/settings", { preHandler: requireStaff }, async (req) => {
    const auth = req.auth as StaffAuth;
    const sections = settingsSectionsForRole(auth.role);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: req.tenantId! },
      include: { modules: true, branches: true },
    });
    return {
      sections,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        businessType: tenant.businessType,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        accentColor: tenant.accentColor,
        theme: tenant.theme,
        email: tenant.email,
        phone: tenant.phone,
      },
      branches: tenant.branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        status: b.status,
        isPrimary: b.isPrimary,
      })),
      modules: tenant.modules.map((m) => ({
        moduleId: m.moduleId,
        enabled: m.enabled,
      })),
    };
  });

  app.get(
    "/staff/settings/audit",
    { preHandler: requirePermission("audit.read") },
    async (req) => {
      const logs = await prisma.auditLog.findMany({
        where: { tenantId: req.tenantId! },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { logs };
    },
  );
}
