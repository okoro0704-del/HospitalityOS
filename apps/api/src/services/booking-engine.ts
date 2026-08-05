import type { Prisma } from "@prisma/client";
import {
  BLOCKING_BOOKING_STATUSES,
  type BookingStatus,
  type BookingCalendarView,
} from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

function bookingCode() {
  return `BK-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

async function addBookingTimeline(opts: {
  tenantId: string;
  bookingId: string;
  eventType: string;
  message: string;
  actorKind: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.bookingTimeline.create({
    data: {
      tenantId: opts.tenantId,
      bookingId: opts.bookingId,
      eventType: opts.eventType,
      message: opts.message,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function ensureDefaultCategories(tenantId: string) {
  const defaults = [
    "accommodation",
    "dining",
    "fitness",
    "wellness",
    "events",
    "entertainment",
    "rental",
    "workspace",
    "tourism",
  ];
  for (const code of defaults) {
    await prisma.resourceCategory.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: {
        tenantId,
        code,
        name: code.charAt(0).toUpperCase() + code.slice(1),
        status: "active",
      },
      update: { status: "active" },
    });
  }
}

export async function ensureDefaultPolicy(tenantId: string, moduleId?: string) {
  const code = moduleId ? `${moduleId}_default` : "default";
  return prisma.bookingPolicy.upsert({
    where: { tenantId_code: { tenantId, code } },
    create: {
      tenantId,
      moduleId: moduleId ?? null,
      name: moduleId ? `${moduleId} default policy` : "Default booking policy",
      code,
      minNoticeMinutes: 0,
      maxAdvanceDays: 365,
      cancellationDeadlineMinutes: 60,
      lateArrivalGraceMinutes: 15,
      defaultDurationMinutes: 60,
      minDurationMinutes: 15,
      maxDurationMinutes: 1440 * 30,
      allowWaitlist: true,
      status: "active",
    },
    update: { status: "active" },
  });
}

export async function syncRoomToBookableResource(opts: {
  tenantId: string;
  roomId: string;
  roomNumber: string;
  propertyCode?: string;
  capacity?: number;
  status?: string;
}) {
  await ensureDefaultCategories(opts.tenantId);
  const category = await prisma.resourceCategory.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: opts.tenantId, code: "accommodation" } },
  });

  const code = `ROOM-${opts.roomId.slice(-8)}-${opts.roomNumber}`;
  const resourceStatus =
    opts.status === "inactive"
      ? "retired"
      : opts.status === "under_maintenance" || opts.status === "blocked"
        ? "maintenance"
        : "available";

  return prisma.bookableResource.upsert({
    where: {
      tenantId_sourceType_sourceId: {
        tenantId: opts.tenantId,
        sourceType: "accommodation_room",
        sourceId: opts.roomId,
      },
    },
    create: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "accommodation",
      name: `Room ${opts.roomNumber}`,
      code,
      capacity: opts.capacity ?? 1,
      status: resourceStatus,
      tags: ["room", "accommodation"],
      metadata: { propertyCode: opts.propertyCode ?? null },
      customFields: {},
      sourceType: "accommodation_room",
      sourceId: opts.roomId,
    },
    update: {
      name: `Room ${opts.roomNumber}`,
      capacity: opts.capacity ?? 1,
      status: resourceStatus,
      metadata: { propertyCode: opts.propertyCode ?? null },
    },
  });
}

export async function getPolicy(tenantId: string, moduleId?: string) {
  if (moduleId) {
    const specific = await prisma.bookingPolicy.findFirst({
      where: { tenantId, moduleId, status: "active" },
    });
    if (specific) return specific;
  }
  return ensureDefaultPolicy(tenantId, moduleId);
}

export async function validateAgainstPolicy(opts: {
  tenantId: string;
  moduleId: string;
  startsAt: Date;
  endsAt: Date;
  now?: Date;
}) {
  const policy = await getPolicy(opts.tenantId, opts.moduleId);
  const now = opts.now ?? new Date();
  const durationMin = (opts.endsAt.getTime() - opts.startsAt.getTime()) / 60000;

  if (durationMin <= 0) {
    throw httpError("End must be after start", "validation_error", 400);
  }
  if (durationMin < policy.minDurationMinutes) {
    throw httpError(
      `Minimum duration is ${policy.minDurationMinutes} minutes`,
      "policy_violation",
      409,
    );
  }
  if (durationMin > policy.maxDurationMinutes) {
    throw httpError(
      `Maximum duration is ${policy.maxDurationMinutes} minutes`,
      "policy_violation",
      409,
    );
  }
  const noticeMin = (opts.startsAt.getTime() - now.getTime()) / 60000;
  if (noticeMin < policy.minNoticeMinutes) {
    throw httpError(
      `Bookings require at least ${policy.minNoticeMinutes} minutes notice`,
      "policy_violation",
      409,
    );
  }
  const maxAdvanceMs = policy.maxAdvanceDays * 24 * 60 * 60 * 1000;
  if (opts.startsAt.getTime() - now.getTime() > maxAdvanceMs) {
    throw httpError(
      `Cannot book more than ${policy.maxAdvanceDays} days in advance`,
      "policy_violation",
      409,
    );
  }
  return policy;
}

export async function findResourceConflicts(opts: {
  tenantId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  excludeBookingId?: string;
  quantity?: number;
}) {
  const quantity = opts.quantity ?? 1;
  const resource = await prisma.bookableResource.findFirst({
    where: { id: opts.resourceId, tenantId: opts.tenantId },
  });
  if (!resource) throw httpError("Resource not found", "not_found", 404);

  if (["maintenance", "blocked", "retired", "unavailable"].includes(resource.status)) {
    return {
      ok: false as const,
      code: "resource_unavailable",
      message: `Resource is ${resource.status}`,
      conflicts: [] as string[],
    };
  }

  const blackouts = await prisma.blackoutPeriod.findMany({
    where: {
      tenantId: opts.tenantId,
      status: "active",
      OR: [{ resourceId: opts.resourceId }, { resourceId: null }],
      startsAt: { lt: opts.endsAt },
      endsAt: { gt: opts.startsAt },
    },
  });
  if (blackouts.length) {
    return {
      ok: false as const,
      code: "blackout_conflict",
      message: `Blackout period: ${blackouts[0]!.name}`,
      conflicts: blackouts.map((b) => b.id),
    };
  }

  const holidays = await prisma.holiday.findMany({
    where: { tenantId: opts.tenantId },
  });
  for (const h of holidays) {
    const day = h.date.toISOString().slice(0, 10);
    const startDay = opts.startsAt.toISOString().slice(0, 10);
    const endDay = new Date(opts.endsAt.getTime() - 1).toISOString().slice(0, 10);
    if (day >= startDay && day <= endDay) {
      return {
        ok: false as const,
        code: "holiday_conflict",
        message: `Closed for holiday: ${h.name}`,
        conflicts: [h.id],
      };
    }
  }

  const items = await prisma.bookingItem.findMany({
    where: {
      tenantId: opts.tenantId,
      resourceId: opts.resourceId,
      status: "active",
      booking: {
        status: { in: [...BLOCKING_BOOKING_STATUSES] },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      },
      startsAt: { lt: opts.endsAt },
      endsAt: { gt: opts.startsAt },
    },
    include: { booking: true },
  });

  const used = items.reduce((sum, i) => sum + i.quantity, 0);
  if (used + quantity > resource.capacity) {
    return {
      ok: false as const,
      code: "capacity_exceeded",
      message: `Capacity exceeded (need ${quantity}, free ${Math.max(0, resource.capacity - used)})`,
      conflicts: items.map((i) => i.bookingId),
    };
  }

  return { ok: true as const, free: resource.capacity - used, resource };
}

export async function checkAvailability(opts: {
  tenantId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  quantity?: number;
  excludeBookingId?: string;
}) {
  const result = await findResourceConflicts(opts);
  return {
    available: result.ok,
    ...(result.ok
      ? { freeCapacity: result.free }
      : { error: result.code, message: result.message, conflictIds: result.conflicts }),
  };
}

export async function createBooking(opts: {
  tenantId: string;
  moduleId: string;
  customerId?: string | null;
  startsAt: Date;
  endsAt: Date;
  partySize?: number;
  notes?: string | null;
  internalNotes?: string | null;
  status?: BookingStatus;
  items: Array<{ resourceId: string; quantity?: number; startsAt?: Date; endsAt?: Date }>;
  actorKind: string;
  actorId?: string | null;
  skipPolicy?: boolean;
  allowWaitlistFallback?: boolean;
}) {
  if (!opts.items.length) {
    throw httpError("At least one booking item is required", "validation_error", 400);
  }
  if (!opts.skipPolicy) {
    await validateAgainstPolicy({
      tenantId: opts.tenantId,
      moduleId: opts.moduleId,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
    });
  }

  for (const item of opts.items) {
    const startsAt = item.startsAt ?? opts.startsAt;
    const endsAt = item.endsAt ?? opts.endsAt;
    const check = await findResourceConflicts({
      tenantId: opts.tenantId,
      resourceId: item.resourceId,
      startsAt,
      endsAt,
      quantity: item.quantity ?? 1,
    });
    if (!check.ok) {
      if (opts.allowWaitlistFallback && opts.customerId) {
        const policy = await getPolicy(opts.tenantId, opts.moduleId);
        if (policy.allowWaitlist) {
          const entry = await joinWaitlist({
            tenantId: opts.tenantId,
            moduleId: opts.moduleId,
            customerId: opts.customerId,
            resourceId: item.resourceId,
            startsAt,
            endsAt,
            partySize: opts.partySize ?? 1,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
          });
          throw Object.assign(
            new Error("No availability — added to waitlist"),
            {
              code: "waitlisted",
              statusCode: 409,
              waitlistEntry: entry,
            },
          );
        }
      }
      await prisma.bookingConflict.create({
        data: {
          tenantId: opts.tenantId,
          code: check.code,
          message: check.message,
          metadata: { resourceId: item.resourceId, conflicts: check.conflicts },
        },
      });
      throw httpError(check.message, check.code, 409);
    }
  }

  const status = opts.status ?? "confirmed";
  const booking = await prisma.booking.create({
    data: {
      tenantId: opts.tenantId,
      customerId: opts.customerId ?? null,
      moduleId: opts.moduleId,
      status,
      confirmationCode: bookingCode(),
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      partySize: opts.partySize ?? 1,
      notes: opts.notes ?? null,
      internalNotes: opts.internalNotes ?? null,
      items: {
        create: opts.items.map((item) => ({
          tenantId: opts.tenantId,
          resourceId: item.resourceId,
          quantity: item.quantity ?? 1,
          startsAt: item.startsAt ?? opts.startsAt,
          endsAt: item.endsAt ?? opts.endsAt,
          status: "active",
          metadata: {},
        })),
      },
      reminders: {
        create: [
          {
            tenantId: opts.tenantId,
            remindAt: new Date(opts.startsAt.getTime() - 60 * 60 * 1000),
            channel: "in_app",
            status: "scheduled",
          },
        ],
      },
    },
    include: { items: true },
  });

  await addBookingTimeline({
    tenantId: opts.tenantId,
    bookingId: booking.id,
    eventType: "booking.created",
    message: `Booking ${booking.confirmationCode} created (${status})`,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "booking.created",
    resource: "booking",
    resourceId: booking.id,
    metadata: { confirmationCode: booking.confirmationCode, moduleId: opts.moduleId },
  });

  if (opts.customerId && (status === "confirmed" || status === "pending")) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: opts.customerId,
      title: status === "confirmed" ? "Booking confirmed" : "Booking pending",
      body: `Booking ${booking.confirmationCode} is ${status}.`,
      metadata: { bookingId: booking.id },
    });
  }

  return booking;
}

export async function updateBooking(opts: {
  tenantId: string;
  bookingId: string;
  startsAt?: Date;
  endsAt?: Date;
  partySize?: number;
  notes?: string | null;
  internalNotes?: string | null;
  status?: BookingStatus;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.booking.findFirst({
    where: { id: opts.bookingId, tenantId: opts.tenantId },
    include: { items: true },
  });
  if (!existing) throw httpError("Booking not found", "not_found", 404);
  if (["cancelled", "completed", "expired", "checked_out"].includes(existing.status)) {
    throw httpError("Booking can no longer be modified", "invalid_state", 409);
  }

  const startsAt = opts.startsAt ?? existing.startsAt;
  const endsAt = opts.endsAt ?? existing.endsAt;
  await validateAgainstPolicy({
    tenantId: opts.tenantId,
    moduleId: existing.moduleId,
    startsAt,
    endsAt,
  });

  for (const item of existing.items) {
    const check = await findResourceConflicts({
      tenantId: opts.tenantId,
      resourceId: item.resourceId,
      startsAt: opts.startsAt ?? item.startsAt,
      endsAt: opts.endsAt ?? item.endsAt,
      quantity: item.quantity,
      excludeBookingId: existing.id,
    });
    if (!check.ok) throw httpError(check.message, check.code, 409);
  }

  const updated = await prisma.booking.update({
    where: { id: existing.id },
    data: {
      startsAt,
      endsAt,
      partySize: opts.partySize ?? existing.partySize,
      notes: opts.notes !== undefined ? opts.notes : existing.notes,
      internalNotes:
        opts.internalNotes !== undefined ? opts.internalNotes : existing.internalNotes,
      status: opts.status ?? existing.status,
      items: {
        updateMany: {
          where: { bookingId: existing.id },
          data: { startsAt, endsAt },
        },
      },
    },
    include: { items: true },
  });

  await addBookingTimeline({
    tenantId: opts.tenantId,
    bookingId: updated.id,
    eventType: "booking.updated",
    message: "Booking updated",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "booking.updated",
    resource: "booking",
    resourceId: updated.id,
  });

  if (updated.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: updated.customerId,
      title: "Booking updated",
      body: `Booking ${updated.confirmationCode} was updated.`,
      metadata: { bookingId: updated.id },
    });
  }

  return updated;
}

export async function cancelBooking(opts: {
  tenantId: string;
  bookingId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.booking.findFirst({
    where: { id: opts.bookingId, tenantId: opts.tenantId },
    include: { items: true },
  });
  if (!existing) throw httpError("Booking not found", "not_found", 404);
  if (["cancelled", "checked_out", "completed"].includes(existing.status)) {
    throw httpError("Booking cannot be cancelled", "invalid_state", 409);
  }
  if (existing.status === "checked_in") {
    throw httpError("Checked-in bookings must be checked out", "invalid_state", 409);
  }

  const policy = await getPolicy(opts.tenantId, existing.moduleId);
  const minutesToStart = (existing.startsAt.getTime() - Date.now()) / 60000;
  if (minutesToStart < policy.cancellationDeadlineMinutes && minutesToStart > 0) {
    // Soft warning path — still allow staff overrides; guests blocked by caller if needed
  }

  const updated = await prisma.booking.update({
    where: { id: existing.id },
    data: { status: "cancelled", cancelledAt: new Date() },
    include: { items: true },
  });

  await addBookingTimeline({
    tenantId: opts.tenantId,
    bookingId: updated.id,
    eventType: "booking.cancelled",
    message: "Booking cancelled",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "booking.cancelled",
    resource: "booking",
    resourceId: updated.id,
  });

  if (updated.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: updated.customerId,
      title: "Booking cancelled",
      body: `Booking ${updated.confirmationCode} was cancelled.`,
      metadata: { bookingId: updated.id },
    });
  }

  // Promote waitlist for freed resources
  for (const item of existing.items) {
    await promoteWaitlistForResource({
      tenantId: opts.tenantId,
      resourceId: item.resourceId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    });
  }

  return updated;
}

export async function transitionBooking(opts: {
  tenantId: string;
  bookingId: string;
  status: BookingStatus;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.booking.findFirst({
    where: { id: opts.bookingId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Booking not found", "not_found", 404);

  const data: Prisma.BookingUpdateInput = { status: opts.status };
  if (opts.status === "checked_in") data.checkedInAt = new Date();
  if (opts.status === "checked_out" || opts.status === "completed") {
    data.checkedOutAt = new Date();
  }
  if (opts.status === "cancelled") data.cancelledAt = new Date();

  const updated = await prisma.booking.update({
    where: { id: existing.id },
    data,
    include: { items: true },
  });

  await addBookingTimeline({
    tenantId: opts.tenantId,
    bookingId: updated.id,
    eventType: `booking.${opts.status}`,
    message: `Status → ${opts.status}`,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: `booking.${opts.status}`,
    resource: "booking",
    resourceId: updated.id,
  });

  return updated;
}

export async function joinWaitlist(opts: {
  tenantId: string;
  moduleId: string;
  customerId: string;
  resourceId?: string | null;
  startsAt: Date;
  endsAt: Date;
  partySize?: number;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const policy = await getPolicy(opts.tenantId, opts.moduleId);
  if (!policy.allowWaitlist) {
    throw httpError("Waitlist is disabled by policy", "waitlist_disabled", 409);
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      tenantId: opts.tenantId,
      moduleId: opts.moduleId,
      customerId: opts.customerId,
      resourceId: opts.resourceId ?? null,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      partySize: opts.partySize ?? 1,
      notes: opts.notes ?? null,
      status: "waiting",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "waitlist.joined",
    resource: "waitlist",
    resourceId: entry.id,
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: opts.customerId,
    title: "Added to waitlist",
    body: "You will be notified if a spot opens.",
    metadata: { waitlistEntryId: entry.id },
  });

  return entry;
}

export async function promoteWaitlistForResource(opts: {
  tenantId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const waiting = await prisma.waitlistEntry.findMany({
    where: {
      tenantId: opts.tenantId,
      status: "waiting",
      OR: [{ resourceId: opts.resourceId }, { resourceId: null }],
      startsAt: { lt: opts.endsAt },
      endsAt: { gt: opts.startsAt },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  for (const entry of waiting) {
    const check = await findResourceConflicts({
      tenantId: opts.tenantId,
      resourceId: opts.resourceId,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      quantity: entry.partySize,
    });
    if (!check.ok) continue;

    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: "promoted", promotedAt: new Date() },
    });

    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: entry.customerId,
      title: "Waitlist promotion",
      body: "A resource is now available for your requested time.",
      metadata: { waitlistEntryId: entry.id, resourceId: opts.resourceId },
    });

    await writeAudit({
      tenantId: opts.tenantId,
      actorKind: "system",
      action: "waitlist.promoted",
      resource: "waitlist",
      resourceId: entry.id,
    });
    break;
  }
}

export async function buildBookingCalendar(opts: {
  tenantId: string;
  view: BookingCalendarView;
  anchorDate: Date;
  moduleId?: string;
  branchId?: string;
  resourceId?: string;
}) {
  const anchor = new Date(opts.anchorDate);
  anchor.setUTCHours(0, 0, 0, 0);
  let rangeStart = anchor;
  let rangeEnd = new Date(anchor);

  if (opts.view === "day") {
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  } else if (opts.view === "week") {
    const day = anchor.getUTCDay();
    rangeStart = new Date(anchor);
    rangeStart.setUTCDate(anchor.getUTCDate() - day);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeStart.getUTCDate() + 7);
  } else if (opts.view === "month") {
    rangeStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    rangeEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  } else {
    // timeline / agenda / resource / branch — default week window
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
  }

  const resources = await prisma.bookableResource.findMany({
    where: {
      tenantId: opts.tenantId,
      ...(opts.moduleId ? { moduleId: opts.moduleId } : {}),
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
      ...(opts.resourceId ? { id: opts.resourceId } : {}),
      status: { not: "retired" },
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId: opts.tenantId,
      status: { notIn: ["cancelled", "draft", "expired"] },
      ...(opts.moduleId ? { moduleId: opts.moduleId } : {}),
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
      ...(opts.resourceId
        ? { items: { some: { resourceId: opts.resourceId } } }
        : {}),
    },
    include: { items: true, customer: true },
  });

  const days: string[] = [];
  for (let d = new Date(rangeStart); d < rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  return {
    view: opts.view,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    days,
    resources: resources.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      moduleId: r.moduleId,
      category: r.category.code,
      capacity: r.capacity,
      status: r.status,
      branchId: r.branchId,
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      confirmationCode: b.confirmationCode,
      status: b.status,
      moduleId: b.moduleId,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      customerName: b.customer?.displayName ?? null,
      resourceIds: b.items.map((i) => i.resourceId),
    })),
  };
}

export async function createSchedule(opts: {
  tenantId: string;
  name: string;
  kind: string;
  resourceId?: string | null;
  moduleId?: string | null;
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
  startsOn?: Date | null;
  endsOn?: Date | null;
  capacity?: number | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const schedule = await prisma.resourceSchedule.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name,
      kind: opts.kind,
      resourceId: opts.resourceId ?? null,
      moduleId: opts.moduleId ?? null,
      daysOfWeek: opts.daysOfWeek ?? [],
      startTime: opts.startTime ?? null,
      endTime: opts.endTime ?? null,
      startsOn: opts.startsOn ?? null,
      endsOn: opts.endsOn ?? null,
      capacity: opts.capacity ?? null,
      metadata: {},
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "schedule.created",
    resource: "schedule",
    resourceId: schedule.id,
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    title: "Schedule changes",
    body: `Schedule "${schedule.name}" was created.`,
    metadata: { scheduleId: schedule.id },
  });

  return schedule;
}
