import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_CHANNELS,
  TEMPLATE_TYPES,
} from "@hospitalityos/shared";
import { prisma } from "./db.js";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireNotificationsModule } from "./lib/module-gate.js";
import { writeAudit } from "./lib/audit.js";
import {
  archiveNotification,
  markAllRead,
  markNotificationRead,
  processCommunicationEvent,
  processDueSchedules,
  retryDelivery,
} from "./services/communications/engine.js";
import { createTemplate, renderTemplate } from "./services/communications/templates.js";

function mapErr(err: unknown) {
  const e = err as { statusCode?: number; code?: string; message?: string };
  return {
    status: e.statusCode ?? 500,
    body: { error: e.code ?? "internal_error", message: e.message ?? "Unexpected error" },
  };
}

function mapNotification(n: {
  id: string;
  title: string;
  body: string;
  channel: string;
  category: string;
  priority: string;
  status: string;
  audience: string;
  deepLink: string | null;
  sourceModule: string | null;
  readAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    channel: n.channel,
    category: n.category,
    priority: n.priority,
    status: n.status,
    audience: n.audience,
    deepLink: n.deepLink,
    sourceModule: n.sourceModule,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    expiresAt: n.expiresAt?.toISOString() ?? null,
  };
}

async function notifPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireNotificationsModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireNotificationsModule(req, reply);
  };
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  const staffBasic = requireStaff;
  const staffNotif = await notifPre();
  const staffWrite = await notifPre([
    "owner",
    "admin",
    "manager",
    "communications_manager",
    "front_desk",
    "operations",
  ]);
  const staffAdmin = await notifPre(["owner", "admin", "manager", "communications_manager"]);
  const staffMarketing = await notifPre(["owner", "admin", "communications_manager"]);

  /* Staff inbox — audience separated from customers; ungated for platform compat */
  app.get("/notifications", { preHandler: staffBasic }, async (req) => {
    const q = req.query as { category?: string; status?: string };
    const items = await prisma.notification.findMany({
      where: {
        tenantId: req.tenantId!,
        audience: "staff",
        ...(q.category ? { category: q.category } : {}),
        ...(q.status ? { status: q.status } : {}),
        NOT: { status: "archived" },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { notifications: items.map(mapNotification) };
  });

  app.get("/staff/notifications", { preHandler: staffBasic }, async (req) => {
    const items = await prisma.notification.findMany({
      where: {
        tenantId: req.tenantId!,
        audience: "staff",
        NOT: { status: "archived" },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { notifications: items.map(mapNotification) };
  });

  app.post("/notifications/read-all", { preHandler: staffBasic }, async (req) => {
    const result = await markAllRead({
      tenantId: req.tenantId!,
      audience: "staff",
      actorId: (req.auth as StaffAuth).staffId,
    });
    return { updated: result.count };
  });

  /* Preferences */
  app.get("/notifications/preferences", { preHandler: staffNotif }, async (req) => {
    const auth = req.auth as StaffAuth;
    const pref = await prisma.notificationPreference.upsert({
      where: {
        tenantId_recipientKind_recipientId: {
          tenantId: req.tenantId!,
          recipientKind: "staff",
          recipientId: auth.staffId,
        },
      },
      create: {
        tenantId: req.tenantId!,
        recipientKind: "staff",
        recipientId: auth.staffId,
        metadata: {},
      },
      update: {},
    });
    return { preferences: pref };
  });

  app.patch("/notifications/preferences", { preHandler: staffNotif }, async (req) => {
    const auth = req.auth as StaffAuth;
    const body = z
      .object({
        inAppEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
        smsEnabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        marketingEmail: z.boolean().optional(),
        marketingSms: z.boolean().optional(),
        marketingPush: z.boolean().optional(),
        transactionalOk: z.boolean().optional(),
      })
      .parse(req.body);
    const pref = await prisma.notificationPreference.upsert({
      where: {
        tenantId_recipientKind_recipientId: {
          tenantId: req.tenantId!,
          recipientKind: "staff",
          recipientId: auth.staffId,
        },
      },
      create: {
        tenantId: req.tenantId!,
        recipientKind: "staff",
        recipientId: auth.staffId,
        ...body,
        metadata: {},
      },
      update: body,
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: auth.staffId,
      action: "notification.preference.updated",
      resource: "notification_preference",
      resourceId: pref.id,
    });
    return { preferences: pref };
  });

  /* Templates */
  app.get("/notifications/templates", { preHandler: staffNotif }, async (req) => {
    const templates = await prisma.notificationTemplate.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: [{ code: "asc" }, { version: "desc" }],
    });
    return { templates };
  });

  app.post("/notifications/templates", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        category: z.enum(NOTIFICATION_CATEGORIES),
        channel: z.enum(NOTIFICATION_CHANNELS).default("in_app"),
        type: z.enum(TEMPLATE_TYPES).default("transactional"),
        subject: z.string().optional(),
        body: z.string().min(1),
        variables: z.array(z.string()).optional(),
      })
      .parse(req.body);

    if (body.type === "marketing") {
      // marketing templates require marketing roles — already staffMarketing for separate route;
      // enforce here too when type is marketing via staffAdmin which includes communications_manager
    }

    const template = await createTemplate({
      tenantId: req.tenantId!,
      ...body,
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "notification.template.created",
      resource: "notification_template",
      resourceId: template.id,
    });
    return reply.code(201).send({ template });
  });

  app.post("/notifications/templates/marketing", { preHandler: staffMarketing }, async (req, reply) => {
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        category: z.literal("marketing").default("marketing"),
        channel: z.enum(NOTIFICATION_CHANNELS).default("email"),
        subject: z.string().optional(),
        body: z.string().min(1),
        variables: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const template = await createTemplate({
      tenantId: req.tenantId!,
      ...body,
      type: "marketing",
      category: "marketing",
    });
    return reply.code(201).send({ template });
  });

  /* Rules */
  app.get("/notifications/rules", { preHandler: staffNotif }, async (req) => {
    const rules = await prisma.notificationRule.findMany({
      where: { tenantId: req.tenantId! },
      include: { template: true },
      orderBy: { name: "asc" },
    });
    return { rules };
  });

  app.post("/notifications/rules", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        eventType: z.string().min(1),
        templateId: z.string().optional(),
        channels: z.array(z.enum(NOTIFICATION_CHANNELS)).default(["in_app"]),
        audience: z.enum(["customer", "staff"]).default("customer"),
        category: z.enum(NOTIFICATION_CATEGORIES).default("system"),
        priority: z.enum(NOTIFICATION_PRIORITIES).default("normal"),
        deepLinkTpl: z.string().optional(),
        delayMinutes: z.number().int().min(0).default(0),
        enabled: z.boolean().default(true),
      })
      .parse(req.body);
    const rule = await prisma.notificationRule.create({
      data: {
        tenantId: req.tenantId!,
        code: body.code,
        name: body.name,
        eventType: body.eventType,
        templateId: body.templateId ?? null,
        channels: body.channels,
        audience: body.audience,
        category: body.category,
        priority: body.priority,
        deepLinkTpl: body.deepLinkTpl ?? null,
        delayMinutes: body.delayMinutes,
        enabled: body.enabled,
        metadata: {},
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "notification.rule.created",
      resource: "notification_rule",
      resourceId: rule.id,
    });
    return reply.code(201).send({ rule });
  });

  app.patch("/notifications/rules/:id", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        enabled: z.boolean().optional(),
        delayMinutes: z.number().int().min(0).optional(),
        channels: z.array(z.enum(NOTIFICATION_CHANNELS)).optional(),
        templateId: z.string().nullable().optional(),
      })
      .parse(req.body);
    const existing = await prisma.notificationRule.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!existing) return reply.code(404).send({ error: "not_found" });
    const rule = await prisma.notificationRule.update({
      where: { id },
      data: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.delayMinutes !== undefined ? { delayMinutes: body.delayMinutes } : {}),
        ...(body.channels ? { channels: body.channels } : {}),
        ...(body.templateId !== undefined ? { templateId: body.templateId } : {}),
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "notification.rule.updated",
      resource: "notification_rule",
      resourceId: rule.id,
    });
    return { rule };
  });

  /* Deliveries */
  app.get("/notifications/deliveries", { preHandler: staffNotif }, async (req) => {
    const q = req.query as { status?: string };
    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { deliveries };
  });

  app.post("/notifications/deliveries/:id/retry", { preHandler: staffWrite }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const delivery = await retryDelivery({
        tenantId: req.tenantId!,
        deliveryId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { delivery };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  /* Schedules */
  app.get("/notifications/schedules", { preHandler: staffNotif }, async (req) => {
    const schedules = await prisma.notificationSchedule.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    });
    return { schedules };
  });

  app.post("/notifications/schedules/process-due", { preHandler: staffAdmin }, async () => {
    const result = await processDueSchedules();
    return result;
  });

  /* Test / emit event */
  app.post("/notifications/test", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        eventType: z.string().min(1),
        sourceModule: z.string().default("notifications"),
        sourceEntityId: z.string().optional(),
        customerId: z.string().optional(),
        staffUserId: z.string().optional(),
        deepLink: z.string().optional(),
        variables: z.record(z.unknown()).optional(),
        forceImmediate: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const result = await processCommunicationEvent({
        tenantId: req.tenantId!,
        ...body,
        forceImmediate: body.forceImmediate ?? true,
      });
      await writeAudit({
        tenantId: req.tenantId!,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
        action: "notification.test.emit",
        resource: "notification_event",
        resourceId: result.event.id,
      });
      return { result };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/notifications/render-preview", { preHandler: staffNotif }, async (req) => {
    const body = z
      .object({
        template: z.string(),
        variables: z.record(z.unknown()).default({}),
      })
      .parse(req.body);
    return { rendered: renderTemplate(body.template, body.variables) };
  });

  app.get("/notifications/:id", { preHandler: staffBasic }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const n = await prisma.notification.findFirst({
      where: { id, tenantId: req.tenantId!, audience: "staff" },
    });
    if (!n) return tenantNotFound(reply);
    return { notification: mapNotification(n) };
  });

  app.post("/notifications/:id/read", { preHandler: staffBasic }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const n = await markNotificationRead({
        tenantId: req.tenantId!,
        notificationId: id,
        recipientKind: "staff",
        recipientId: (req.auth as StaffAuth).staffId,
      });
      return { notification: mapNotification(n) };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/notifications/:id/archive", { preHandler: staffBasic }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const n = await archiveNotification({
        tenantId: req.tenantId!,
        notificationId: id,
        audience: "staff",
      });
      return { notification: mapNotification(n) };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  /* Guest */
  app.get("/guest/notifications", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const q = req.query as { category?: string; status?: string; filter?: string };
    const categoryMap: Record<string, string[]> = {
      bookings: ["booking", "reservation", "appointment", "accommodation"],
      orders: ["order"],
      events: ["event", "cinema"],
      promotions: ["promotion", "marketing"],
    };
    const cats = q.filter && categoryMap[q.filter] ? categoryMap[q.filter] : null;

    const items = await prisma.notification.findMany({
      where: {
        tenantId: auth.tenantId,
        audience: "customer",
        NOT: { status: "archived" },
        AND: [
          {
            OR: [
              { actorKind: "guest", actorId: auth.customerId },
              { actorKind: "broadcast" },
            ],
          },
          ...(q.status === "unread" ? [{ status: "unread" }] : []),
          ...(cats ? [{ category: { in: cats } }] : []),
          ...(q.category ? [{ category: q.category }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { notifications: items.map(mapNotification) };
  });

  app.post("/guest/notifications/:id/read", { preHandler: requireGuest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    try {
      const n = await markNotificationRead({
        tenantId: auth.tenantId,
        notificationId: id,
        recipientKind: "customer",
        recipientId: auth.customerId,
      });
      return { notification: mapNotification(n) };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/guest/notifications/read-all", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const result = await markAllRead({
      tenantId: auth.tenantId,
      audience: "customer",
      actorId: auth.customerId,
    });
    return { updated: result.count };
  });

  app.get("/guest/notifications/preferences", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const pref = await prisma.notificationPreference.upsert({
      where: {
        tenantId_recipientKind_recipientId: {
          tenantId: auth.tenantId,
          recipientKind: "customer",
          recipientId: auth.customerId,
        },
      },
      create: {
        tenantId: auth.tenantId,
        recipientKind: "customer",
        recipientId: auth.customerId,
        metadata: {},
      },
      update: {},
    });
    const crm = await prisma.customerCommunicationPreference.findUnique({
      where: { customerId: auth.customerId },
    });
    return { preferences: pref, crmCommunicationPreferences: crm };
  });

  app.patch("/guest/notifications/preferences", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        inAppEnabled: z.boolean().optional(),
        emailEnabled: z.boolean().optional(),
        smsEnabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        marketingEmail: z.boolean().optional(),
        marketingSms: z.boolean().optional(),
        marketingPush: z.boolean().optional(),
      })
      .parse(req.body);
    const pref = await prisma.notificationPreference.upsert({
      where: {
        tenantId_recipientKind_recipientId: {
          tenantId: auth.tenantId,
          recipientKind: "customer",
          recipientId: auth.customerId,
        },
      },
      create: {
        tenantId: auth.tenantId,
        recipientKind: "customer",
        recipientId: auth.customerId,
        ...body,
        metadata: {},
      },
      update: body,
    });
    if (
      body.emailEnabled !== undefined ||
      body.smsEnabled !== undefined ||
      body.pushEnabled !== undefined
    ) {
      await prisma.customerCommunicationPreference.upsert({
        where: { customerId: auth.customerId },
        create: {
          tenantId: auth.tenantId,
          customerId: auth.customerId,
          emailOptIn: body.emailEnabled ?? false,
          smsOptIn: body.smsEnabled ?? false,
          pushOptIn: body.pushEnabled ?? false,
          metadata: {},
        },
        update: {
          ...(body.emailEnabled !== undefined ? { emailOptIn: body.emailEnabled } : {}),
          ...(body.smsEnabled !== undefined ? { smsOptIn: body.smsEnabled } : {}),
          ...(body.pushEnabled !== undefined ? { pushOptIn: body.pushEnabled } : {}),
        },
      });
    }
    await writeAudit({
      tenantId: auth.tenantId,
      actorKind: "guest",
      actorId: auth.customerId,
      action: "notification.preference.updated",
      resource: "notification_preference",
      resourceId: pref.id,
    });
    return { preferences: pref };
  });
}
