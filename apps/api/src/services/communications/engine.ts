import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { writeAudit } from "../../lib/audit.js";
import { buildIdempotencyKey, renderTemplate } from "./templates.js";
import { getProvider } from "./providers.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

export type CommunicationEventInput = {
  tenantId: string;
  eventType: string;
  sourceModule: string;
  sourceEntityId?: string | null;
  customerId?: string | null;
  staffUserId?: string | null;
  metadata?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  deepLink?: string | null;
  /** Force process immediately ignoring delay (tests). */
  forceImmediate?: boolean;
};

async function logComm(opts: {
  tenantId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  actorKind?: string | null;
  actorId?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.communicationLog.create({
    data: {
      tenantId: opts.tenantId,
      action: opts.action,
      resource: opts.resource,
      resourceId: opts.resourceId ?? null,
      actorKind: opts.actorKind ?? null,
      actorId: opts.actorId ?? null,
      detail: opts.detail ?? null,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
  await prisma.notificationAuditEvent.create({
    data: {
      tenantId: opts.tenantId,
      action: opts.action,
      resource: opts.resource,
      resourceId: opts.resourceId ?? null,
      actorKind: opts.actorKind ?? null,
      actorId: opts.actorId ?? null,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

async function getOrCreatePrefs(opts: {
  tenantId: string;
  recipientKind: string;
  recipientId: string;
}) {
  return prisma.notificationPreference.upsert({
    where: {
      tenantId_recipientKind_recipientId: {
        tenantId: opts.tenantId,
        recipientKind: opts.recipientKind,
        recipientId: opts.recipientId,
      },
    },
    create: {
      tenantId: opts.tenantId,
      recipientKind: opts.recipientKind,
      recipientId: opts.recipientId,
      metadata: {},
    },
    update: {},
  });
}

async function marketingAllowed(opts: {
  tenantId: string;
  customerId: string;
  channel: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const consent = await prisma.customerConsent.findFirst({
    where: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      purpose: { in: ["marketing", "marketing_email", "marketing_sms", "promotional"] },
      status: "granted",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!consent) return { ok: false, reason: "consent_missing" };

  const prefs = await getOrCreatePrefs({
    tenantId: opts.tenantId,
    recipientKind: "customer",
    recipientId: opts.customerId,
  });
  if (opts.channel === "email" && !prefs.marketingEmail) {
    return { ok: false, reason: "marketing_email_disabled" };
  }
  if (opts.channel === "sms" && !prefs.marketingSms) {
    return { ok: false, reason: "marketing_sms_disabled" };
  }
  if (opts.channel === "push" && !prefs.marketingPush) {
    return { ok: false, reason: "marketing_push_disabled" };
  }
  return { ok: true };
}

function channelEnabledOnPrefs(
  prefs: {
    inAppEnabled: boolean;
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    transactionalOk: boolean;
  },
  channel: string,
  isMarketing: boolean,
) {
  if (!isMarketing && !prefs.transactionalOk && channel !== "in_app") {
    // transactional in-app always allowed for essential ops
    return channel === "in_app";
  }
  switch (channel) {
    case "in_app":
      return prefs.inAppEnabled;
    case "email":
      return prefs.emailEnabled;
    case "sms":
      return prefs.smsEnabled;
    case "push":
      return prefs.pushEnabled;
    default:
      return false;
  }
}

async function resolveVariables(
  tenantId: string,
  customerId: string | null | undefined,
  extra?: Record<string, unknown>,
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const customer = customerId
    ? await prisma.customer.findFirst({ where: { id: customerId, tenantId } })
    : null;
  return {
    customer: {
      firstName: customer?.firstName ?? customer?.displayName?.split(" ")[0] ?? "",
      lastName: customer?.lastName ?? "",
      displayName: customer?.displayName ?? "",
    },
    business: { name: tenant?.name ?? "" },
    booking: (extra?.booking as Record<string, unknown>) ?? {},
    venue: (extra?.venue as Record<string, unknown>) ?? {},
    experience: (extra?.experience as Record<string, unknown>) ?? {},
    order: (extra?.order as Record<string, unknown>) ?? {},
    ...(extra ?? {}),
  };
}

export async function createInAppNotification(opts: {
  tenantId: string;
  actorKind: string;
  actorId?: string | null;
  title: string;
  body: string;
  category?: string;
  priority?: string;
  audience?: string;
  sourceModule?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  channel?: string;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const audience =
    opts.audience ??
    (opts.actorKind === "guest" || opts.actorKind === "broadcast" ? "customer" : "staff");

  return prisma.notification.create({
    data: {
      tenantId: opts.tenantId,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
      title: opts.title,
      body: opts.body,
      channel: opts.channel ?? "in_app",
      category: opts.category ?? "system",
      priority: opts.priority ?? "normal",
      status: "unread",
      audience,
      sourceModule: opts.sourceModule ?? null,
      sourceEntityId: opts.sourceEntityId ?? null,
      deepLink: opts.deepLink ?? null,
      expiresAt: opts.expiresAt ?? null,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

async function deliverChannel(opts: {
  tenantId: string;
  notificationId: string | null;
  eventId: string | null;
  channel: string;
  idempotencyKey: string;
  to: string;
  subject: string | null;
  body: string;
  isMarketing: boolean;
  customerId?: string | null;
  templateType?: string;
}) {
  const existing = await prisma.notificationDelivery.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: opts.tenantId,
        idempotencyKey: opts.idempotencyKey,
      },
    },
  });
  if (existing) {
    return { delivery: existing, duplicate: true as const };
  }

  if (opts.isMarketing && opts.customerId) {
    const gate = await marketingAllowed({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      channel: opts.channel,
    });
    if (!gate.ok) {
      try {
        const blocked = await prisma.notificationDelivery.create({
          data: {
            tenantId: opts.tenantId,
            notificationId: opts.notificationId,
            eventId: opts.eventId,
            channel: opts.channel,
            status: "blocked",
            provider: "policy",
            attemptCount: 1,
            lastError: gate.reason ?? "blocked",
            idempotencyKey: opts.idempotencyKey,
            payload: { reason: gate.reason },
          },
        });
        await logComm({
          tenantId: opts.tenantId,
          action: "notification.delivery.blocked",
          resource: "notification_delivery",
          resourceId: blocked.id,
          detail: gate.reason,
        });
        return { delivery: blocked, duplicate: false as const };
      } catch (err) {
        const dup = await prisma.notificationDelivery.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: opts.tenantId,
              idempotencyKey: opts.idempotencyKey,
            },
          },
        });
        if (dup) return { delivery: dup, duplicate: true as const };
        throw err;
      }
    }
  }

  if (opts.customerId && opts.channel !== "in_app") {
    const prefs = await getOrCreatePrefs({
      tenantId: opts.tenantId,
      recipientKind: "customer",
      recipientId: opts.customerId,
    });
    if (!channelEnabledOnPrefs(prefs, opts.channel, opts.isMarketing)) {
      const skipped = await prisma.notificationDelivery.create({
        data: {
          tenantId: opts.tenantId,
          notificationId: opts.notificationId,
          eventId: opts.eventId,
          channel: opts.channel,
          status: "skipped",
          provider: "preference",
          attemptCount: 1,
          lastError: "channel_disabled",
          idempotencyKey: opts.idempotencyKey,
          payload: {},
        },
      });
      return { delivery: skipped, duplicate: false as const };
    }
  }

  const provider = getProvider(opts.channel);
  if (!provider) {
    const failed = await prisma.notificationDelivery.create({
      data: {
        tenantId: opts.tenantId,
        notificationId: opts.notificationId,
        eventId: opts.eventId,
        channel: opts.channel,
        status: "failed",
        provider: "none",
        attemptCount: 1,
        lastError: "provider_unavailable",
        idempotencyKey: opts.idempotencyKey,
        payload: {},
      },
    });
    return { delivery: failed, duplicate: false as const };
  }

  let delivery;
  try {
    delivery = await prisma.notificationDelivery.create({
      data: {
        tenantId: opts.tenantId,
        notificationId: opts.notificationId,
        eventId: opts.eventId,
        channel: opts.channel,
        status: "processing",
        provider: provider.channel === "in_app" ? "in_app" : `${opts.channel}_mock`,
        attemptCount: 1,
        idempotencyKey: opts.idempotencyKey,
        payload: { to: opts.to, subject: opts.subject },
      },
    });
  } catch {
    const dup = await prisma.notificationDelivery.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: opts.tenantId,
          idempotencyKey: opts.idempotencyKey,
        },
      },
    });
    if (dup) return { delivery: dup, duplicate: true as const };
    throw new Error("delivery_create_failed");
  }

  try {
    const result = await provider.send({
      tenantId: opts.tenantId,
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
    });
    delivery = await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.status === "delivered" ? "delivered" : result.ok ? "sent" : "failed",
        lastError: result.error ?? null,
        sentAt: result.ok ? new Date() : null,
        deliveredAt: result.status === "delivered" ? new Date() : null,
        payload: {
          to: opts.to,
          subject: opts.subject,
          externalId: result.externalId,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    delivery = await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        lastError: err instanceof Error ? err.message : "send_failed",
      },
    });
  }

  await logComm({
    tenantId: opts.tenantId,
    action: `notification.delivery.${delivery.status}`,
    resource: "notification_delivery",
    resourceId: delivery.id,
  });

  return { delivery, duplicate: false as const };
}

/**
 * Core event → rules → templates → channel adapters pipeline.
 * Synchronous for Sprint 12; designed to move behind a queue later.
 */
export async function processCommunicationEvent(input: CommunicationEventInput) {
  const event = await prisma.notificationEvent.create({
    data: {
      tenantId: input.tenantId,
      eventType: input.eventType,
      sourceModule: input.sourceModule,
      sourceEntityId: input.sourceEntityId ?? null,
      customerId: input.customerId ?? null,
      staffUserId: input.staffUserId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  const rules = await prisma.notificationRule.findMany({
    where: {
      tenantId: input.tenantId,
      eventType: input.eventType,
      enabled: true,
    },
    include: { template: true },
  });

  const results: Array<{ ruleId: string; notificationId?: string; deliveryIds: string[] }> = [];
  const variables = await resolveVariables(input.tenantId, input.customerId, input.variables);

  for (const rule of rules) {
    const channels = Array.isArray(rule.channels)
      ? (rule.channels as string[])
      : typeof rule.channels === "string"
        ? [rule.channels]
        : ["in_app"];

    const delay = input.forceImmediate ? 0 : rule.delayMinutes ?? 0;
    if (delay > 0) {
      await prisma.notificationSchedule.create({
        data: {
          tenantId: input.tenantId,
          eventId: event.id,
          ruleId: rule.id,
          scheduledAt: new Date(Date.now() + delay * 60_000),
          status: "pending",
          metadata: {
            eventType: input.eventType,
            customerId: input.customerId,
            deepLink: input.deepLink,
            variables: input.variables ?? {},
          } as Prisma.InputJsonValue,
        },
      });
      results.push({ ruleId: rule.id, deliveryIds: [] });
      continue;
    }

    const title = rule.template
      ? renderTemplate(rule.template.subject || rule.template.name, variables)
      : rule.name;
    const body = rule.template
      ? renderTemplate(rule.template.body, variables)
      : `Event ${input.eventType}`;
    const deepLink =
      input.deepLink ??
      (rule.deepLinkTpl ? renderTemplate(rule.deepLinkTpl, variables) : null);
    const isMarketing =
      rule.category === "marketing" || rule.template?.type === "marketing";

    const actorKind = rule.audience === "staff" ? "staff" : "guest";
    const actorId =
      rule.audience === "staff"
        ? input.staffUserId ?? null
        : input.customerId ?? null;

    let notificationId: string | null = null;
    const deliveryIds: string[] = [];

    if (channels.includes("in_app")) {
      const idem = buildIdempotencyKey({
        tenantId: input.tenantId,
        eventType: input.eventType,
        sourceEntityId: input.sourceEntityId,
        recipientKind: rule.audience === "staff" ? "staff" : "customer",
        recipientId: actorId ?? "broadcast",
        ruleId: rule.id,
        channel: "in_app",
      });
      const existingDelivery = await prisma.notificationDelivery.findUnique({
        where: {
          tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: idem },
        },
      });
      if (existingDelivery) {
        results.push({
          ruleId: rule.id,
          notificationId: existingDelivery.notificationId ?? undefined,
          deliveryIds: [existingDelivery.id],
        });
        continue;
      }

      const notification = await createInAppNotification({
        tenantId: input.tenantId,
        actorKind: actorId ? actorKind : rule.audience === "staff" ? "system" : "broadcast",
        actorId,
        title: title || rule.name,
        body,
        category: rule.category,
        priority: rule.priority,
        audience: rule.audience,
        sourceModule: input.sourceModule,
        sourceEntityId: input.sourceEntityId,
        deepLink,
        metadata: { eventType: input.eventType, ruleId: rule.id },
      });
      notificationId = notification.id;

      const d = await deliverChannel({
        tenantId: input.tenantId,
        notificationId: notification.id,
        eventId: event.id,
        channel: "in_app",
        idempotencyKey: idem,
        to: actorId ?? "broadcast",
        subject: title,
        body,
        isMarketing,
        customerId: input.customerId,
        templateType: rule.template?.type,
      });
      deliveryIds.push(d.delivery.id);
    }

    for (const channel of channels.filter((c) => c !== "in_app")) {
      const recipientId = actorId ?? "unknown";
      const idem = buildIdempotencyKey({
        tenantId: input.tenantId,
        eventType: input.eventType,
        sourceEntityId: input.sourceEntityId,
        recipientKind: rule.audience === "staff" ? "staff" : "customer",
        recipientId,
        ruleId: rule.id,
        channel,
      });
      let to = recipientId;
      if (channel === "email" && input.customerId) {
        const c = await prisma.customer.findFirst({
          where: { id: input.customerId, tenantId: input.tenantId },
        });
        to = c?.email ?? "";
      }
      if (channel === "sms" && input.customerId) {
        const c = await prisma.customer.findFirst({
          where: { id: input.customerId, tenantId: input.tenantId },
        });
        to = c?.phone ?? "";
      }

      const d = await deliverChannel({
        tenantId: input.tenantId,
        notificationId,
        eventId: event.id,
        channel,
        idempotencyKey: idem,
        to,
        subject: title,
        body,
        isMarketing,
        customerId: input.customerId,
        templateType: rule.template?.type,
      });
      deliveryIds.push(d.delivery.id);
    }

    results.push({ ruleId: rule.id, notificationId: notificationId ?? undefined, deliveryIds });
  }

  await prisma.notificationEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date() },
  });

  await logComm({
    tenantId: input.tenantId,
    action: "notification.event.processed",
    resource: "notification_event",
    resourceId: event.id,
    metadata: { eventType: input.eventType, rules: results.length },
  });

  return { event, results };
}

/** Process due schedules — callable by a future worker. */
export async function processDueSchedules(opts?: { now?: Date; limit?: number }) {
  const now = opts?.now ?? new Date();
  const due = await prisma.notificationSchedule.findMany({
    where: { status: "pending", scheduledAt: { lte: now } },
    take: opts?.limit ?? 50,
    orderBy: { scheduledAt: "asc" },
  });

  const processed = [];
  for (const schedule of due) {
    await prisma.notificationSchedule.update({
      where: { id: schedule.id },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    const meta = (schedule.metadata ?? {}) as Record<string, unknown>;
    const event = schedule.eventId
      ? await prisma.notificationEvent.findUnique({ where: { id: schedule.eventId } })
      : null;
    if (!event && !meta.eventType) {
      await prisma.notificationSchedule.update({
        where: { id: schedule.id },
        data: { status: "failed" },
      });
      continue;
    }

    const rule = schedule.ruleId
      ? await prisma.notificationRule.findFirst({
          where: { id: schedule.ruleId, tenantId: schedule.tenantId },
          include: { template: true },
        })
      : null;

    if (!rule) {
      await prisma.notificationSchedule.update({
        where: { id: schedule.id },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      continue;
    }

    // Temporarily zero delay by forcing a one-shot delivery path via a synthetic immediate process
    // using the stored event — re-emit with forceImmediate against only this rule by cloning enablement
    const wasEnabled = rule.enabled;
    // Deliver using processCommunicationEvent with forceImmediate but only matching this event type —
    // disable sibling rules briefly is too risky; instead inline deliver for this rule:
    const variables = await resolveVariables(
      schedule.tenantId,
      (meta.customerId as string) ?? event?.customerId,
      (meta.variables as Record<string, unknown>) ?? {},
    );
    const title = rule.template
      ? renderTemplate(rule.template.subject || rule.template.name, variables)
      : rule.name;
    const body = rule.template
      ? renderTemplate(rule.template.body, variables)
      : `Scheduled: ${rule.eventType}`;
    const deepLink =
      (meta.deepLink as string) ??
      (rule.deepLinkTpl ? renderTemplate(rule.deepLinkTpl, variables) : null);
    const actorKind = rule.audience === "staff" ? "staff" : "guest";
    const actorId =
      rule.audience === "staff"
        ? event?.staffUserId ?? null
        : (meta.customerId as string) ?? event?.customerId ?? null;

    const notification = await createInAppNotification({
      tenantId: schedule.tenantId,
      actorKind: actorId ? actorKind : "broadcast",
      actorId,
      title: title || rule.name,
      body,
      category: rule.category,
      priority: rule.priority,
      audience: rule.audience,
      sourceModule: event?.sourceModule ?? "notifications",
      sourceEntityId: event?.sourceEntityId,
      deepLink,
      metadata: { scheduleId: schedule.id, ruleId: rule.id },
    });

    const idem = buildIdempotencyKey({
      tenantId: schedule.tenantId,
      eventType: rule.eventType,
      sourceEntityId: event?.sourceEntityId,
      recipientKind: rule.audience === "staff" ? "staff" : "customer",
      recipientId: actorId ?? "broadcast",
      ruleId: rule.id,
      channel: "in_app",
    });

    await deliverChannel({
      tenantId: schedule.tenantId,
      notificationId: notification.id,
      eventId: event?.id ?? null,
      channel: "in_app",
      idempotencyKey: idem,
      to: actorId ?? "broadcast",
      subject: title,
      body,
      isMarketing: rule.category === "marketing",
      customerId: actorId,
    });

    await prisma.notificationSchedule.update({
      where: { id: schedule.id },
      data: {
        status: "completed",
        processedAt: new Date(),
        notificationId: notification.id,
      },
    });
    void wasEnabled;
    processed.push(schedule.id);
  }
  return { processed };
}

export async function retryDelivery(opts: {
  tenantId: string;
  deliveryId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const delivery = await prisma.notificationDelivery.findFirst({
    where: { id: opts.deliveryId, tenantId: opts.tenantId },
  });
  if (!delivery) throw httpError("Delivery not found", "not_found", 404);
  if (delivery.status !== "failed") {
    throw httpError("Only failed deliveries can retry", "validation_error", 400);
  }
  if (delivery.attemptCount >= delivery.maxAttempts) {
    throw httpError("Max retry attempts reached", "max_retries", 400);
  }

  const provider = getProvider(delivery.channel);
  if (!provider) throw httpError("Provider unavailable", "provider_unavailable", 400);

  const payload = (delivery.payload ?? {}) as { to?: string; subject?: string; body?: string };
  const result = await provider.send({
    tenantId: opts.tenantId,
    to: payload.to ?? "",
    subject: payload.subject,
    body: payload.body ?? "",
  });

  const updated = await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: {
      attemptCount: { increment: 1 },
      status: result.ok ? (result.status === "delivered" ? "delivered" : "sent") : "failed",
      lastError: result.error ?? null,
      sentAt: result.ok ? new Date() : delivery.sentAt,
      provider: result.provider,
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "notification.delivery.retry",
    resource: "notification_delivery",
    resourceId: delivery.id,
  });

  return updated;
}

export async function markNotificationRead(opts: {
  tenantId: string;
  notificationId: string;
  recipientKind: string;
  recipientId: string;
}) {
  const n = await prisma.notification.findFirst({
    where: { id: opts.notificationId, tenantId: opts.tenantId },
  });
  if (!n) throw httpError("Notification not found", "not_found", 404);
  if (n.audience === "customer" && opts.recipientKind === "customer") {
    if (n.actorKind === "guest" && n.actorId && n.actorId !== opts.recipientId) {
      throw httpError("Notification not found", "not_found", 404);
    }
  }
  if (n.audience === "staff" && opts.recipientKind === "customer") {
    throw httpError("Notification not found", "not_found", 404);
  }
  return prisma.notification.update({
    where: { id: n.id },
    data: { status: "read", readAt: new Date() },
  });
}

export async function markAllRead(opts: {
  tenantId: string;
  audience: string;
  actorKind?: string;
  actorId?: string;
}) {
  const where: Prisma.NotificationWhereInput = {
    tenantId: opts.tenantId,
    audience: opts.audience,
    status: "unread",
  };
  if (opts.audience === "customer" && opts.actorId) {
    where.OR = [
      { actorKind: "guest", actorId: opts.actorId },
      { actorKind: "broadcast" },
    ];
  }
  const result = await prisma.notification.updateMany({
    where,
    data: { status: "read", readAt: new Date() },
  });
  return result;
}

export async function archiveNotification(opts: {
  tenantId: string;
  notificationId: string;
  actorId?: string;
  audience: string;
}) {
  const n = await prisma.notification.findFirst({
    where: { id: opts.notificationId, tenantId: opts.tenantId, audience: opts.audience },
  });
  if (!n) throw httpError("Notification not found", "not_found", 404);
  if (opts.audience === "customer" && n.actorKind === "guest" && n.actorId !== opts.actorId) {
    throw httpError("Notification not found", "not_found", 404);
  }
  return prisma.notification.update({
    where: { id: n.id },
    data: { status: "archived", archivedAt: new Date() },
  });
}
