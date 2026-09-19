import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import {
  GUEST_COOKIE,
  STAFF_COOKIE,
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  assertSameTenant,
} from "./lib/auth.js";
import { prisma } from "./db.js";
import {
  toBranchPublic,
  toCustomerPublic,
  toGuestSessionPublic,
  toStaffPublic,
  toStaffSessionPublic,
  toTenantPublic,
} from "./lib/mappers.js";
import { createGuestSessionFromHandoff, revokeGuestSession, createDemoGuestSession } from "./services/guest-auth.js";
import { staffLogin, revokeStaffSession } from "./services/staff-auth.js";
import { getModuleCatalog, getTenantModules, setTenantModule } from "./services/modules.js";
import { writeAudit } from "./lib/audit.js";
import { isModuleId } from "@hospitalityos/shared";

import { registerAccommodationRoutes } from "./routes-accommodation.js";
import { registerBookingRoutes } from "./routes-booking.js";
import { registerCommerceRoutes } from "./routes-commerce.js";
import { registerRestaurantRoutes } from "./routes-restaurant.js";
import { registerFitnessRoutes } from "./routes-fitness.js";
import { registerSpaRoutes } from "./routes-spa.js";
import { registerEventsRoutes } from "./routes-events.js";
import { registerCinemaRoutes } from "./routes-cinema.js";
import { registerOperationsRoutes } from "./routes-operations.js";
import { registerCrmRoutes } from "./routes-crm.js";
import { registerNotificationRoutes } from "./routes-notifications.js";
import { registerBillingRoutes } from "./routes-billing.js";
import { registerLifeOsPublicRoutes } from "./routes/lifeos-public.js";
import { listLifeOsPublicFeed } from "./services/lifeos-public-feed.js";

const cookieOpts = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
};

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    status: "ok" as const,
    service: "hospitalityos-api" as const,
    version: config.version,
    time: new Date().toISOString(),
  }));

  await registerAccommodationRoutes(app);
  await registerBookingRoutes(app);
  await registerCommerceRoutes(app);
  await registerRestaurantRoutes(app);
  await registerFitnessRoutes(app);
  await registerSpaRoutes(app);
  await registerEventsRoutes(app);
  await registerCinemaRoutes(app);
  await registerOperationsRoutes(app);
  await registerCrmRoutes(app);
  await registerNotificationRoutes(app);
  await registerBillingRoutes(app);
  await registerLifeOsPublicRoutes(app);

  // ── Module catalog (platform-wide) ───────────────────────────
  app.get("/modules/catalog", async () => ({
    modules: getModuleCatalog(),
  }));

  // ── Public tenant branding / config ──────────────────────────
  app.get("/tenants/:slug/public", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      include: { modules: true, branches: true },
    });
    if (!tenant || tenant.status !== "active") {
      return tenantNotFound(reply);
    }
    return {
      tenant: toTenantPublic(tenant, tenant.modules),
      branches: tenant.branches
        .filter((b) => b.status === "active")
        .map(toBranchPublic),
    };
  });

  /**
   * Digiconomy News publication projection.
   * HospitalityOS remains the owner. News stores nothing.
   */
  app.get("/tenants/:slug/public/publications", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || tenant.status !== "active") {
      return tenantNotFound(reply);
    }
    const feed = await listLifeOsPublicFeed({
      kind: "publication",
      tenantSlug: slug,
      limit: 50,
    });
    return {
      publications: feed.items.map((item) => ({
        id: item.provenance.sourceItemId,
        title: item.title,
        caption: item.summary,
        type: item.itemType,
        canonicalSourceUrl: item.canonicalSourceUrl,
        publishedAt: item.publishedAt,
        assetReferences: item.assetReferences,
      })),
    };
  });

  // ── Guest auth: LifeOS experience-session handoff ────────────
  app.post("/auth/guest/exchange", async (req, reply) => {
    const body = z
      .object({
        handoff: z.string().min(1),
        experienceId: z.string().min(1),
      })
      .parse(req.body);

    try {
      const result = await createGuestSessionFromHandoff(body);
      reply.setCookie(GUEST_COOKIE, result.token, {
        ...cookieOpts,
        expires: new Date(result.session.expiresAt),
      });
      return {
        token: result.token,
        session: result.session,
        customer: result.customer,
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 401).send({
        error: e.code ?? "invalid_token",
        message: e.message,
      });
    }
  });

  /** Demo venue entry — HospitalityOS-local session (no TrustID / LifeOS). */
  app.post("/auth/guest/demo", async (req, reply) => {
    const body = z
      .object({
        tenantSlug: z.string().min(1),
        displayName: z.string().min(1).optional(),
      })
      .parse(req.body);

    try {
      const result = await createDemoGuestSession(body);
      reply.setCookie(GUEST_COOKIE, result.token, {
        ...cookieOpts,
        expires: new Date(result.session.expiresAt),
      });
      return {
        token: result.token,
        session: result.session,
        customer: result.customer,
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "demo_failed",
        message: e.message,
      });
    }
  });

  app.get("/auth/guest/me", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth!;
    if (auth.kind !== "guest") throw new Error("unexpected");
    const session = await prisma.guestSession.findUniqueOrThrow({
      where: { id: auth.sessionId },
    });
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: auth.customerId },
    });
    return {
      session: toGuestSessionPublic(session),
      customer: toCustomerPublic(customer),
    };
  });

  app.post("/auth/guest/logout", { preHandler: requireGuest }, async (req, reply) => {
    const auth = req.auth!;
    if (auth.kind !== "guest") throw new Error("unexpected");
    await revokeGuestSession(auth.sessionId, auth.tenantId);
    reply.clearCookie(GUEST_COOKIE, { path: "/" });
    await writeAudit({
      tenantId: auth.tenantId,
      actorKind: "guest",
      actorId: auth.customerId,
      action: "auth.guest.logout",
      resource: "guest_session",
      resourceId: auth.sessionId,
    });
    return { ok: true };
  });

  // ── Staff auth (local; LifeOS Business Portal later) ─────────
  app.post("/auth/staff/login", async (req, reply) => {
    const body = z
      .object({
        tenantSlug: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(1),
      })
      .parse(req.body);

    try {
      const result = await staffLogin(body);
      reply.setCookie(STAFF_COOKIE, result.token, {
        ...cookieOpts,
        expires: new Date(result.session.expiresAt),
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 401).send({
        error: e.code ?? "invalid_credentials",
        message: e.message,
      });
    }
  });

  app.get("/auth/staff/me", { preHandler: requireStaff }, async (req) => {
    const auth = req.auth!;
    if (auth.kind !== "staff") throw new Error("unexpected");
    const session = await prisma.staffSession.findUniqueOrThrow({
      where: { id: auth.sessionId },
      include: { staff: true },
    });
    return {
      session: toStaffSessionPublic(session),
      staff: toStaffPublic(session.staff),
    };
  });

  app.post("/auth/staff/logout", { preHandler: requireStaff }, async (req, reply) => {
    const auth = req.auth!;
    if (auth.kind !== "staff") throw new Error("unexpected");
    await revokeStaffSession(auth.sessionId, auth.tenantId);
    reply.clearCookie(STAFF_COOKIE, { path: "/" });
    return { ok: true };
  });

  // ── Tenant (staff) ───────────────────────────────────────────
  app.get("/tenant", { preHandler: requireStaff }, async (req) => {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: req.tenantId! },
      include: { modules: true },
    });
    return { tenant: toTenantPublic(tenant, tenant.modules) };
  });

  app.patch("/tenant/branding", {
    preHandler: await requireStaffRoles(["owner", "admin"]),
  }, async (req, reply) => {
    const body = z
      .object({
        logoUrl: z.string().url().nullable().optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
        fontFamily: z.string().nullable().optional(),
        name: z.string().min(1).optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        website: z.string().url().nullable().optional(),
        addressLine1: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        region: z.string().nullable().optional(),
        postalCode: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        operatingHours: z.array(z.any()).optional(),
      })
      .parse(req.body);

    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId! },
      data: body,
      include: { modules: true },
    });

    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as { staffId: string }).staffId,
      action: "tenant.branding.update",
      resource: "tenant",
      resourceId: tenant.id,
    });

    return { tenant: toTenantPublic(tenant, tenant.modules) };
  });

  // ── Branches ─────────────────────────────────────────────────
  app.get("/branches", { preHandler: requireStaff }, async (req) => {
    const branches = await prisma.branch.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return { branches: branches.map(toBranchPublic) };
  });

  app.post("/branches", {
    preHandler: await requireStaffRoles(["owner", "admin", "manager"]),
  }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        timezone: z.string().default("UTC"),
        isPrimary: z.boolean().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        addressLine1: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
      })
      .parse(req.body);

    const branch = await prisma.branch.create({
      data: {
        tenantId: req.tenantId!,
        ...body,
      },
    });
    return { branch: toBranchPublic(branch) };
  });

  // ── Modules per tenant ───────────────────────────────────────
  app.get("/tenant/modules", { preHandler: requireStaff }, async (req) => {
    const modules = await getTenantModules(req.tenantId!);
    return { modules };
  });

  app.put("/tenant/modules/:moduleId", {
    preHandler: await requireStaffRoles(["owner", "admin"]),
  }, async (req, reply) => {
    const { moduleId } = req.params as { moduleId: string };
    const body = z
      .object({
        enabled: z.boolean(),
        config: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    if (!isModuleId(moduleId)) {
      return reply.code(400).send({
        error: "invalid_module",
        message: `Unknown module: ${moduleId}`,
      });
    }

    try {
      const row = await setTenantModule({
        tenantId: req.tenantId!,
        moduleId,
        enabled: body.enabled,
        config: body.config,
        actorId: (req.auth as { staffId: string }).staffId,
      });
      return {
        module: {
          moduleId: row.moduleId,
          enabled: row.enabled,
          config: row.config,
        },
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "invalid_module",
        message: e.message,
      });
    }
  });

  // Guest-visible enabled modules for current tenant
  app.get("/guest/modules", { preHandler: requireGuest }, async (req) => {
    const modules = await getTenantModules(req.tenantId!);
    return {
      modules: modules.filter((m) => m.enabled && m.guestNavKey),
    };
  });

  // ── Staff management ─────────────────────────────────────────
  app.get("/staff", {
    preHandler: await requireStaffRoles(["owner", "admin", "manager"]),
  }, async (req) => {
    const staff = await prisma.staffMember.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
    });
    return { staff: staff.map(toStaffPublic) };
  });

  app.get("/staff/:id", {
    preHandler: await requireStaffRoles(["owner", "admin", "manager"]),
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await prisma.staffMember.findUnique({ where: { id } });
    if (!member || !assertSameTenant(member.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    return { staff: toStaffPublic(member) };
  });

  // ── Audit logs ───────────────────────────────────────────────
  app.get("/audit-logs", {
    preHandler: await requireStaffRoles(["owner", "admin"]),
  }, async (req) => {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        resource: l.resource,
        resourceId: l.resourceId,
        actorKind: l.actorKind,
        actorId: l.actorId,
        createdAt: l.createdAt.toISOString(),
        metadata: l.metadata,
      })),
    };
  });

  // ── Platform admin: list tenants (dev / platform ops) ─────────
  app.get("/platform/tenants", async () => {
    const tenants = await prisma.tenant.findMany({
      include: { modules: true },
      orderBy: { name: "asc" },
    });
    return {
      tenants: tenants.map((t) => toTenantPublic(t, t.modules)),
    };
  });
}
