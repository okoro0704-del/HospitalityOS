import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "./config.js";
import {
  GUEST_COOKIE,
  STAFF_COOKIE,
  PLATFORM_COOKIE,
  requireGuest,
  requireStaff,
  requireStaffRoles,
  requirePlatformAdmin,
  tenantNotFound,
  assertSameTenant,
  type StaffAuth,
  type PlatformAuth,
} from "./lib/auth.js";
import { requirePermission } from "./lib/permissions.js";
import { branchIdFilter, assertBranchAccess } from "./lib/branch-scope.js";
import { checkRateLimit } from "./lib/rate-limit.js";
import { prisma } from "./db.js";
import {
  toBranchPublic,
  toCustomerPublic,
  toGuestSessionPublic,
  toStaffPublic,
  toStaffSessionPublic,
  toTenantPublic,
} from "./lib/mappers.js";
import { createGuestSessionFromHandoff, revokeGuestSession, createDemoGuestSession, createGuestSessionFromTrustId } from "./services/guest-auth.js";
import { staffLogin, revokeStaffSession, staffLoginWithTrustId } from "./services/staff-auth.js";
import {
  platformAdminLogin,
  revokePlatformSession,
  verifyWebhookSignature,
} from "./services/platform-auth.js";
import {
  createStaffMember,
  updateStaffMember,
  deactivateStaffMember,
  linkStaffTrustId,
  unlinkStaffTrustId,
} from "./services/staff-management.js";
import { getModuleCatalog, getTenantModules, setTenantModule } from "./services/modules.js";
import { writeAudit } from "./lib/audit.js";
import { isModuleId, permissionsForRole } from "@hospitalityos/shared";
import { processWebhook } from "./services/billing/engine.js";

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
import { registerMediaRoutes } from "./routes-media.js";
import { registerAdminCommunicationsRoutes } from "./routes-admin-communications.js";
import { registerBillingRoutes } from "./routes-billing.js";
import { registerOperationsTodayRoutes } from "./routes-operations-today.js";
import { registerInternalProvisionRoutes } from "./routes/internal/provision.js";
import { registerLifeOsPublicRoutes } from "./routes/lifeos-public.js";
import { listLifeOsPublicFeed } from "./services/lifeos-public-feed.js";

const cookieOpts = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
};

export async function registerRoutes(app: FastifyInstance) {
  await registerInternalProvisionRoutes(app);

  app.get("/health", async () => ({
    status: "ok" as const,
    service: "hospitalityos-api" as const,
    version: config.version,
    time: new Date().toISOString(),
  }));

  /** Readiness — verifies database connectivity without leaking infrastructure details. */
  app.get("/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: "ready" as const,
        checks: { database: "ok" },
        time: new Date().toISOString(),
      };
    } catch {
      return reply.code(503).send({
        status: "not_ready",
        checks: { database: "error" },
        time: new Date().toISOString(),
      });
    }
  });

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
  await registerMediaRoutes(app);
  await registerLifeOsPublicRoutes(app);
  await registerAdminCommunicationsRoutes(app);
  await registerBillingRoutes(app);
  await registerOperationsTodayRoutes(app);

  // ── Background jobs (staff / admin) ──────────────────────────
  // Enqueue goes through IJobDispatcher; process/summary stay on local runner.
  app.post(
    "/jobs/process-due",
    { preHandler: [requirePermission("settings.manage")] },
    async (req) => {
      const { processDueJobs } = await import("./services/jobs.js");
      const body = z.object({ limit: z.number().int().positive().max(100).optional() }).parse(req.body ?? {});
      return processDueJobs(body.limit ?? 20);
    },
  );

  app.get(
    "/jobs/summary",
    { preHandler: [requirePermission("settings.manage")] },
    async (req) => {
      const { jobStatusSummary } = await import("./services/jobs.js");
      const auth = req.auth as StaffAuth;
      return { summary: await jobStatusSummary(auth.tenantId) };
    },
  );

  app.post(
    "/jobs/enqueue",
    { preHandler: [requirePermission("settings.manage")] },
    async (req, reply) => {
      const { getJobDispatcher } = await import("@hospitalityos/shared");
      const auth = req.auth as StaffAuth;
      const body = z
        .object({
          type: z.string().min(1),
          idempotencyKey: z.string().min(1),
          payload: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const dispatched = await getJobDispatcher().dispatch({
        jobName: body.type,
        deduplicationKey: body.idempotencyKey,
        payload: { ...(body.payload ?? {}), _tenantId: auth.tenantId },
      });
      return reply.code(201).send({
        job: { id: dispatched.jobId, status: dispatched.status, type: body.type },
      });
    },
  );

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
   * Projects BusinessPublication rows (public + published only).
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

  /**
   * Guest authentication via TrustID assertion.
   * Creates/links a tenant-scoped Customer with externalIdentityRef = TID-…
   * Does NOT store TrustID passwords or biometrics.
   */
  app.post("/auth/guest/trustid/exchange", async (req, reply) => {
    const body = z
      .object({
        assertion: z.string().min(1),
        tenantSlug: z.string().min(1),
      })
      .parse(req.body);

    try {
      const result = await createGuestSessionFromTrustId(body);
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
        trustId: result.trustId,
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 401).send({
        error: e.code ?? "invalid_token",
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
      authProvider: session.authProvider,
      trustIdVerified: session.authProvider === "trustid",
      identity: customer.trustId
        ? { trustId: customer.trustId, linked: true }
        : null,
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

  // ── Staff auth (password + TrustID assertion exchange) ───────
  app.post("/auth/staff/login", async (req, reply) => {
    const body = z
      .object({
        tenantSlug: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(1),
      })
      .parse(req.body);

    const rateKey = `staff-login:${req.ip}:${body.email.toLowerCase()}`;
    if (!checkRateLimit(rateKey, config.loginRateLimit, config.loginRateWindowMs)) {
      return reply.code(429).send({
        error: "rate_limited",
        message: "Too many login attempts. Try again later.",
        requestId: req.id,
      });
    }

    try {
      const result = await staffLogin(body);
      reply.setCookie(STAFF_COOKIE, result.token, {
        ...cookieOpts,
        expires: new Date(result.session.expiresAt),
      });
      return {
        ...result,
        permissions: permissionsForRole(result.staff.role),
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 401).send({
        error: e.code ?? "invalid_credentials",
        message: "Invalid credentials",
        requestId: req.id,
      });
    }
  });

  /**
   * Staff login via TrustID. Requires existing tenant staff membership linked to TID-…
   * Authentication ≠ authorization — no auto-grant.
   */
  app.post("/auth/staff/trustid/exchange", async (req, reply) => {
    const body = z
      .object({
        assertion: z.string().min(1),
        tenantSlug: z.string().min(1),
      })
      .parse(req.body);

    const rateKey = `staff-trustid:${req.ip}:${body.tenantSlug}`;
    if (!checkRateLimit(rateKey, config.loginRateLimit, config.loginRateWindowMs)) {
      return reply.code(429).send({
        error: "rate_limited",
        message: "Too many login attempts. Try again later.",
        requestId: req.id,
      });
    }

    try {
      const result = await staffLoginWithTrustId(body);
      reply.setCookie(STAFF_COOKIE, result.token, {
        ...cookieOpts,
        expires: new Date(result.session.expiresAt),
      });
      return {
        ...result,
        permissions: permissionsForRole(result.staff.role),
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 401).send({
        error: e.code ?? "invalid_token",
        message: e.message,
        requestId: req.id,
      });
    }
  });

  app.get("/auth/staff/me", { preHandler: requireStaff }, async (req) => {
    const auth = req.auth as StaffAuth;
    const session = await prisma.staffSession.findUniqueOrThrow({
      where: { id: auth.sessionId },
      include: { staff: true },
    });
    return {
      session: toStaffSessionPublic(session),
      staff: toStaffPublic(session.staff),
      permissions: auth.permissions,
      branchIds: auth.branchIds,
      organizationId: auth.organizationId ?? null,
      authProvider: session.authProvider,
      trustIdVerified: session.authProvider === "trustid",
      identity: session.trustId
        ? { trustId: session.trustId, linked: true }
        : session.staff.trustId
          ? { trustId: session.staff.trustId, linked: true }
          : null,
      authClassification:
        session.authProvider === "legacy_password" ? "LEGACY_DEVELOPMENT" : "TRUSTID",
    };
  });

  /** Request TrustID step-up for a sensitive action. */
  app.post("/auth/staff/step-up/challenge", {
    preHandler: requireStaff,
  }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const body = z.object({ action: z.string().min(1) }).parse(req.body);
    const { isStepUpAction, createStepUpChallenge } = await import("./services/step-up.js");
    if (!isStepUpAction(body.action)) {
      return reply.code(400).send({ error: "validation_error", message: "Unknown step-up action" });
    }
    const challenge = await createStepUpChallenge({
      tenantId: auth.tenantId,
      staffId: auth.staffId,
      staffSessionId: auth.sessionId,
      action: body.action,
    });
    return reply.code(403).send({
      error: "step_up_required",
      message: challenge.message,
      challenge,
    });
  });

  /** Satisfy step-up with a TrustID step_up assertion. */
  app.post("/auth/staff/step-up/satisfy", {
    preHandler: requireStaff,
  }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const body = z
      .object({
        challengeId: z.string().min(1),
        assertion: z.string().min(1),
      })
      .parse(req.body);
    try {
      const { satisfyStepUpChallenge } = await import("./services/step-up.js");
      return await satisfyStepUpChallenge({
        challengeId: body.challengeId,
        tenantId: auth.tenantId,
        staffId: auth.staffId,
        assertion: body.assertion,
      });
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 401).send({
        error: e.code ?? "step_up_failed",
        message: e.message,
      });
    }
  });

  /** TrustID → HOS session revocation webhook (server-configured secret). */
  app.post("/webhooks/trustid/session-revoked", async (req, reply) => {
    const raw =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});
    const sig = req.headers["x-trustid-signature"] as string | undefined;
    const {
      verifyTrustIdWebhookSignature,
      revokeHosSessionsForTrustId,
    } = await import("./services/trustid-session-revoke.js");
    if (!verifyTrustIdWebhookSignature(raw, sig)) {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid webhook signature" });
    }
    const body = z
      .object({
        trustId: z.string().optional(),
        jti: z.string().optional(),
        sid: z.string().optional(),
        reason: z.string().optional(),
      })
      .parse(typeof req.body === "object" && req.body ? req.body : JSON.parse(raw));
    if (!body.trustId && !body.jti && !body.sid) {
      return reply.code(400).send({ error: "validation_error", message: "jti, sid, or trustId required" });
    }
    const result = await revokeHosSessionsForTrustId(body);
    return { ok: true, ...result };
  });

  app.post("/auth/staff/logout", { preHandler: requireStaff }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    await revokeStaffSession(auth.sessionId, auth.tenantId);
    reply.clearCookie(STAFF_COOKIE, { path: "/" });
    await writeAudit({
      tenantId: auth.tenantId,
      actorKind: "staff",
      actorId: auth.staffId,
      action: "auth.staff.logout",
      resource: "staff_session",
      resourceId: auth.sessionId,
    });
    return { ok: true };
  });

  // ── Platform admin auth (never tenant staff) ─────────────────
  app.post("/auth/platform/login", async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .parse(req.body);

    const rateKey = `platform-login:${req.ip}:${body.email.toLowerCase()}`;
    if (!checkRateLimit(rateKey, config.loginRateLimit, config.loginRateWindowMs)) {
      return reply.code(429).send({
        error: "rate_limited",
        message: "Too many login attempts. Try again later.",
        requestId: req.id,
      });
    }

    try {
      const result = await platformAdminLogin(body);
      reply.setCookie(PLATFORM_COOKIE, result.token, {
        ...cookieOpts,
        expires: new Date(result.session.expiresAt),
      });
      return result;
    } catch {
      return reply.code(401).send({
        error: "invalid_credentials",
        message: "Invalid credentials",
        requestId: req.id,
      });
    }
  });

  app.post("/auth/platform/logout", { preHandler: requirePlatformAdmin }, async (req, reply) => {
    const auth = req.auth as PlatformAuth;
    await revokePlatformSession(auth.sessionId);
    reply.clearCookie(PLATFORM_COOKIE, { path: "/" });
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
    preHandler: requirePermission("settings.manage"),
  }, async (req) => {
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
      actorId: (req.auth as StaffAuth).staffId,
      action: "tenant.branding.update",
      resource: "tenant",
      resourceId: tenant.id,
    });

    return { tenant: toTenantPublic(tenant, tenant.modules) };
  });

  // ── Branches ─────────────────────────────────────────────────
  app.get("/branches", { preHandler: requireStaff }, async (req) => {
    const auth = req.auth as StaffAuth;
    const filter = branchIdFilter(auth);
    const branches = await prisma.branch.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(filter ? { id: filter } : {}),
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return { branches: branches.map(toBranchPublic) };
  });

  app.post("/branches", {
    preHandler: requirePermission("settings.manage"),
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
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "branch.created",
      resource: "branch",
      resourceId: branch.id,
    });
    return { branch: toBranchPublic(branch) };
  });

  // ── Modules per tenant ───────────────────────────────────────
  app.get("/tenant/modules", { preHandler: requireStaff }, async (req) => {
    const modules = await getTenantModules(req.tenantId!);
    return { modules };
  });

  app.put("/tenant/modules/:moduleId", {
    preHandler: requirePermission("modules.manage"),
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
        actorId: (req.auth as StaffAuth).staffId,
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
    preHandler: requirePermission("staff.manage"),
  }, async (req) => {
    const staff = await prisma.staffMember.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
    });
    return { staff: staff.map(toStaffPublic) };
  });

  app.get("/staff/:id", {
    preHandler: requirePermission("staff.manage"),
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const member = await prisma.staffMember.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!member) return tenantNotFound(reply);
    return { staff: toStaffPublic(member) };
  });

  app.post("/staff", {
    preHandler: requirePermission("staff.manage"),
  }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const body = z
      .object({
        displayName: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8).optional(),
        trustId: z.string().startsWith("TID-").optional(),
        role: z.string().min(1),
        branchIds: z.array(z.string()).optional(),
      })
      .refine((b) => !!b.password || !!b.trustId, {
        message: "password or trustId required",
      })
      .parse(req.body);

    // Reject mass-assignment attempts of protected fields if present alongside
    const raw = (req.body ?? {}) as Record<string, unknown>;
    if (raw.tenantId || raw.organizationId || raw.passwordHash || raw.permissions || raw.collectedByStaffId) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Protected fields cannot be assigned by clients",
      });
    }

    try {
      const staff = await createStaffMember({
        tenantId: req.tenantId!,
        actorId: auth.staffId,
        ...body,
        actorRole: auth.role,
      });
      return reply.code(201).send({ staff });
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "validation_error",
        message: e.message,
      });
    }
  });

  /** Link an existing staff member to a TrustID identity (invitation acceptance). */
  app.post("/staff/:id/trustid", {
    preHandler: requirePermission("staff.manage"),
  }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const { id } = req.params as { id: string };
    const body = z.object({ trustId: z.string().startsWith("TID-") }).parse(req.body);
    try {
      const result = await linkStaffTrustId({
        tenantId: req.tenantId!,
        staffId: id,
        actorId: auth.staffId,
        actorRole: auth.role,
        trustId: body.trustId,
      });
      return { staff: result.staff, link: { id: result.link.id, trustId: result.link.trustId } };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "validation_error",
        message: e.message,
      });
    }
  });

  app.delete("/staff/:id/trustid", {
    preHandler: requirePermission("staff.manage"),
  }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const { id } = req.params as { id: string };
    try {
      const staff = await unlinkStaffTrustId({
        tenantId: req.tenantId!,
        staffId: id,
        actorId: auth.staffId,
        actorRole: auth.role,
      });
      return { staff };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "validation_error",
        message: e.message,
      });
    }
  });

  app.patch("/staff/:id", {
    preHandler: requirePermission("roles.manage"),
  }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const { id } = req.params as { id: string };
    const raw = (req.body ?? {}) as Record<string, unknown>;
    if (
      raw.tenantId ||
      raw.organizationId ||
      raw.passwordHash ||
      raw.permissions ||
      raw.collectedByStaffId ||
      raw.trustId ||
      raw.externalIdentityRef
    ) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Protected fields cannot be assigned by clients",
      });
    }
    try {
      const staff = await updateStaffMember({
        tenantId: req.tenantId!,
        staffId: id,
        actorId: auth.staffId,
        actorRole: auth.role,
        rawBody: raw,
      });
      return { staff };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "validation_error",
        message: e.message,
      });
    }
  });

  app.delete("/staff/:id", {
    preHandler: requirePermission("staff.manage"),
  }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const { id } = req.params as { id: string };
    try {
      const staff = await deactivateStaffMember({
        tenantId: req.tenantId!,
        staffId: id,
        actorId: auth.staffId,
        actorRole: auth.role,
      });
      return { staff };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "validation_error",
        message: e.message,
      });
    }
  });

  // ── Audit logs ───────────────────────────────────────────────
  app.get("/audit-logs", {
    preHandler: requirePermission("audit.read"),
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

  // ── Media metadata (tenant-scoped) ───────────────────────────
  app.get("/media/:id", { preHandler: requireStaff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await prisma.mediaAsset.findFirst({
      where: { id, tenantId: req.tenantId!, deletedAt: null },
    });
    if (!asset) return tenantNotFound(reply);
    return {
      media: {
        id: asset.id,
        tenantId: asset.tenantId,
        kind: asset.kind,
        altText: asset.altText,
        isPublic: asset.isPublic,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        url: asset.storageKey ? null : asset.url,
        private: Boolean(asset.storageKey),
        createdAt: asset.createdAt.toISOString(),
      },
    };
  });

  // ── Provider webhooks (signature required; tenant from records) ─
  app.post("/webhooks/payments/:provider", async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const signature =
      (req.headers["x-hos-signature"] as string | undefined) ??
      (req.headers["x-webhook-signature"] as string | undefined);
    const payload = (req.body ?? {}) as Record<string, unknown>;

    if (!verifyWebhookSignature(payload, signature)) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Invalid webhook signature",
        requestId: req.id,
      });
    }

    try {
      const event = await processWebhook({
        provider,
        payload,
        signature,
        tenantId: null,
      });
      return { event };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "invalid_webhook",
        message: e.message,
        requestId: req.id,
      });
    }
  });

  // ── Demo venue discovery (gated; not platform enumeration) ───
  app.get("/public/demo/venues", async (_req, reply) => {
    if (!config.allowDemoGuest) {
      return reply.code(404).send({
        error: "not_found",
        message: "Demo venues are disabled",
      });
    }
    const tenants = await prisma.tenant.findMany({
      where: { status: "active" },
      include: { modules: true },
      orderBy: { name: "asc" },
    });
    return {
      venues: tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        businessType: t.businessType,
        branding: {
          primaryColor: t.primaryColor,
          accentColor: t.accentColor,
        },
        enabledModules: t.modules.filter((m) => m.enabled).map((m) => m.moduleId),
        experienceId: t.experienceId,
      })),
    };
  });

  // ── Platform admin: list tenants (NO public access) ──────────
  app.get("/platform/tenants", { preHandler: requirePlatformAdmin }, async () => {
    const tenants = await prisma.tenant.findMany({
      include: { modules: true, organization: true },
      orderBy: { name: "asc" },
    });
    return {
      tenants: tenants.map((t) => ({
        ...toTenantPublic(t, t.modules),
        organizationId: t.organizationId,
        organizationSlug: t.organization?.slug ?? null,
      })),
    };
  });
}
