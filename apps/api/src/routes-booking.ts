import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  BOOKING_CALENDAR_VIEWS,
  BOOKING_STATUSES,
  RESOURCE_STATUSES,
  SCHEDULE_KINDS,
} from "@hospitalityos/shared";
import type { Prisma } from "@prisma/client";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  assertSameTenant,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { prisma } from "./db.js";
import { writeAudit } from "./lib/audit.js";
import { parseJsonArray } from "./lib/crypto.js";
import {
  buildBookingCalendar,
  cancelBooking,
  checkAvailability,
  createBooking,
  createSchedule,
  ensureDefaultCategories,
  ensureDefaultPolicy,
  joinWaitlist,
  transitionBooking,
  updateBooking,
} from "./services/booking-engine.js";

function mapResource(r: {
  id: string;
  tenantId: string;
  categoryId: string;
  moduleId: string;
  branchId: string | null;
  name: string;
  code: string;
  capacity: number;
  status: string;
  tags: unknown;
  metadata: unknown;
  customFields: unknown;
  sourceType: string | null;
  sourceId: string | null;
}) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    categoryId: r.categoryId,
    moduleId: r.moduleId,
    branchId: r.branchId,
    name: r.name,
    code: r.code,
    capacity: r.capacity,
    status: r.status,
    tags: parseJsonArray(r.tags),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    customFields: (r.customFields as Record<string, unknown>) ?? {},
    sourceType: r.sourceType,
    sourceId: r.sourceId,
  };
}

function mapBooking(b: {
  id: string;
  tenantId: string;
  customerId: string | null;
  moduleId: string;
  status: string;
  confirmationCode: string;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  notes: string | null;
  internalNotes: string | null;
  createdAt: Date;
}) {
  return {
    id: b.id,
    tenantId: b.tenantId,
    customerId: b.customerId,
    moduleId: b.moduleId,
    status: b.status,
    confirmationCode: b.confirmationCode,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    partySize: b.partySize,
    notes: b.notes,
    internalNotes: b.internalNotes,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function registerBookingRoutes(app: FastifyInstance) {
  const staffAny = requireStaff;
  const staffManage = await requireStaffRoles([
    "owner",
    "admin",
    "manager",
    "front_desk",
    "operations",
  ]);
  const staffAdmin = await requireStaffRoles(["owner", "admin", "manager"]);

  // Bootstrap defaults when staff opens booking surfaces
  app.post("/booking/bootstrap", { preHandler: staffAny }, async (req) => {
    await ensureDefaultCategories(req.tenantId!);
    await ensureDefaultPolicy(req.tenantId!);
    const categories = await prisma.resourceCategory.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    const policies = await prisma.bookingPolicy.findMany({
      where: { tenantId: req.tenantId! },
    });
    return { categories, policies };
  });

  app.get("/booking/categories", { preHandler: staffAny }, async (req) => {
    await ensureDefaultCategories(req.tenantId!);
    const categories = await prisma.resourceCategory.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { categories };
  });

  app.post("/booking/categories", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
      })
      .parse(req.body);
    const category = await prisma.resourceCategory.create({
      data: { tenantId: req.tenantId!, ...body },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "category.created",
      resource: "resource_category",
      resourceId: category.id,
    });
    return { category };
  });

  app.get("/booking/resources", { preHandler: staffAny }, async (req) => {
    const q = req.query as { moduleId?: string; categoryId?: string };
    const resources = await prisma.bookableResource.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.moduleId ? { moduleId: q.moduleId } : {}),
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      },
      orderBy: { name: "asc" },
    });
    return { resources: resources.map(mapResource) };
  });

  app.post("/booking/resources", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        categoryId: z.string(),
        moduleId: z.string(),
        name: z.string().min(1),
        code: z.string().min(1),
        capacity: z.number().int().positive().default(1),
        branchId: z.string().optional(),
        tags: z.array(z.string()).default([]),
        metadata: z.record(z.unknown()).default({}),
        customFields: z.record(z.unknown()).default({}),
        status: z.enum(RESOURCE_STATUSES).optional(),
      })
      .parse(req.body);

    const resource = await prisma.bookableResource.create({
      data: {
        tenantId: req.tenantId!,
        categoryId: body.categoryId,
        moduleId: body.moduleId,
        name: body.name,
        code: body.code,
        capacity: body.capacity,
        branchId: body.branchId,
        tags: body.tags,
        metadata: body.metadata as Prisma.InputJsonValue,
        customFields: body.customFields as Prisma.InputJsonValue,
        status: body.status ?? "available",
        sourceType: "manual",
        sourceId: `manual_${Date.now()}`,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "resource.created",
      resource: "bookable_resource",
      resourceId: resource.id,
    });
    return { resource: mapResource(resource) };
  });

  app.patch("/booking/resources/:id", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.bookableResource.findUnique({ where: { id } });
    if (!existing || !assertSameTenant(existing.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z
      .object({
        name: z.string().min(1).optional(),
        capacity: z.number().int().positive().optional(),
        status: z.enum(RESOURCE_STATUSES).optional(),
        tags: z.array(z.string()).optional(),
        metadata: z.record(z.unknown()).optional(),
        customFields: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    const resource = await prisma.bookableResource.update({
      where: { id },
      data: {
        name: body.name,
        capacity: body.capacity,
        status: body.status,
        ...(body.tags ? { tags: body.tags } : {}),
        ...(body.metadata ? { metadata: body.metadata as Prisma.InputJsonValue } : {}),
        ...(body.customFields
          ? { customFields: body.customFields as Prisma.InputJsonValue }
          : {}),
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "resource.updated",
      resource: "bookable_resource",
      resourceId: resource.id,
    });
    return { resource: mapResource(resource) };
  });

  app.get("/booking/bookings", { preHandler: staffAny }, async (req) => {
    const q = req.query as { moduleId?: string; status?: string };
    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.moduleId ? { moduleId: q.moduleId } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { startsAt: "asc" },
      include: { items: true },
    });
    return {
      bookings: bookings.map((b) => ({
        ...mapBooking(b),
        items: b.items,
      })),
    };
  });

  app.get("/booking/bookings/:id", { preHandler: staffAny }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        items: true,
        timeline: { orderBy: { createdAt: "asc" } },
        reminders: true,
      },
    });
    if (!booking || !assertSameTenant(booking.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    return {
      booking: mapBooking(booking),
      items: booking.items,
      timeline: booking.timeline,
      reminders: booking.reminders,
    };
  });

  app.post("/booking/bookings", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        moduleId: z.string(),
        customerId: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
        status: z.enum(BOOKING_STATUSES).optional(),
        items: z
          .array(
            z.object({
              resourceId: z.string(),
              quantity: z.number().int().positive().optional(),
            }),
          )
          .min(1),
      })
      .parse(req.body);

    try {
      const booking = await createBooking({
        tenantId: req.tenantId!,
        moduleId: body.moduleId,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        status: body.status,
        items: body.items,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { booking: mapBooking(booking), items: booking.items };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.patch("/booking/bookings/:id", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(BOOKING_STATUSES).optional(),
      })
      .parse(req.body);
    try {
      const booking = await updateBooking({
        tenantId: req.tenantId!,
        bookingId: id,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        partySize: body.partySize,
        notes: body.notes,
        status: body.status,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { booking: mapBooking(booking) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/booking/bookings/:id/cancel", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const booking = await cancelBooking({
        tenantId: req.tenantId!,
        bookingId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { booking: mapBooking(booking) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/booking/bookings/:id/transition", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(BOOKING_STATUSES) }).parse(req.body);
    try {
      const booking = await transitionBooking({
        tenantId: req.tenantId!,
        bookingId: id,
        status: body.status,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { booking: mapBooking(booking) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/booking/availability", { preHandler: staffAny }, async (req, reply) => {
    const q = z
      .object({
        resourceId: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        quantity: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    try {
      const result = await checkAvailability({
        tenantId: req.tenantId!,
        resourceId: q.resourceId,
        startsAt: new Date(q.startsAt),
        endsAt: new Date(q.endsAt),
        quantity: q.quantity,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/booking/validate-conflict", { preHandler: staffAny }, async (req, reply) => {
    const body = z
      .object({
        resourceId: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        quantity: z.number().int().positive().optional(),
        excludeBookingId: z.string().optional(),
      })
      .parse(req.body);
    const result = await checkAvailability({
      tenantId: req.tenantId!,
      resourceId: body.resourceId,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      quantity: body.quantity,
      excludeBookingId: body.excludeBookingId,
    });
    return result;
  });

  app.get("/booking/calendar", { preHandler: staffAny }, async (req) => {
    const q = z
      .object({
        view: z.enum(BOOKING_CALENDAR_VIEWS).default("week"),
        date: z.string().optional(),
        moduleId: z.string().optional(),
        branchId: z.string().optional(),
        resourceId: z.string().optional(),
      })
      .parse(req.query);
    const calendar = await buildBookingCalendar({
      tenantId: req.tenantId!,
      view: q.view,
      anchorDate: q.date ? new Date(q.date) : new Date(),
      moduleId: q.moduleId,
      branchId: q.branchId,
      resourceId: q.resourceId,
    });
    return { calendar };
  });

  app.get("/booking/schedules", { preHandler: staffAny }, async (req) => {
    const schedules = await prisma.resourceSchedule.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
    });
    return { schedules };
  });

  app.post("/booking/schedules", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        kind: z.enum(SCHEDULE_KINDS),
        resourceId: z.string().optional(),
        moduleId: z.string().optional(),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        startsOn: z.string().optional(),
        endsOn: z.string().optional(),
        capacity: z.number().int().positive().optional(),
      })
      .parse(req.body);
    try {
      const schedule = await createSchedule({
        tenantId: req.tenantId!,
        name: body.name,
        kind: body.kind,
        resourceId: body.resourceId,
        moduleId: body.moduleId,
        daysOfWeek: body.daysOfWeek,
        startTime: body.startTime,
        endTime: body.endTime,
        startsOn: body.startsOn ? new Date(body.startsOn) : null,
        endsOn: body.endsOn ? new Date(body.endsOn) : null,
        capacity: body.capacity,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { schedule };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/booking/policies", { preHandler: staffAny }, async (req) => {
    await ensureDefaultPolicy(req.tenantId!);
    const policies = await prisma.bookingPolicy.findMany({
      where: { tenantId: req.tenantId! },
    });
    return { policies };
  });

  app.patch("/booking/policies/:id", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.bookingPolicy.findUnique({ where: { id } });
    if (!existing || !assertSameTenant(existing.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z
      .object({
        minNoticeMinutes: z.number().int().nonnegative().optional(),
        maxAdvanceDays: z.number().int().positive().optional(),
        cancellationDeadlineMinutes: z.number().int().nonnegative().optional(),
        lateArrivalGraceMinutes: z.number().int().nonnegative().optional(),
        defaultDurationMinutes: z.number().int().positive().optional(),
        minDurationMinutes: z.number().int().positive().optional(),
        maxDurationMinutes: z.number().int().positive().optional(),
        allowWaitlist: z.boolean().optional(),
        status: z.enum(["active", "inactive"]).optional(),
      })
      .parse(req.body);
    const policy = await prisma.bookingPolicy.update({ where: { id }, data: body });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "policy.updated",
      resource: "booking_policy",
      resourceId: policy.id,
    });
    return { policy };
  });

  app.get("/booking/blackouts", { preHandler: staffAny }, async (req) => {
    const blackouts = await prisma.blackoutPeriod.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { startsAt: "asc" },
    });
    return { blackouts };
  });

  app.post("/booking/blackouts", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        reason: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        resourceId: z.string().optional(),
        moduleId: z.string().optional(),
      })
      .parse(req.body);
    const blackout = await prisma.blackoutPeriod.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        reason: body.reason,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        resourceId: body.resourceId,
        moduleId: body.moduleId,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "blackout.created",
      resource: "blackout",
      resourceId: blackout.id,
    });
    return { blackout };
  });

  app.get("/booking/holidays", { preHandler: staffAny }, async (req) => {
    const holidays = await prisma.holiday.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { date: "asc" },
    });
    return { holidays };
  });

  app.post("/booking/holidays", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        date: z.string(),
        recurring: z.boolean().optional(),
      })
      .parse(req.body);
    const holiday = await prisma.holiday.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        date: new Date(body.date),
        recurring: body.recurring ?? false,
      },
    });
    return { holiday };
  });

  app.get("/booking/waitlist", { preHandler: staffAny }, async (req) => {
    const entries = await prisma.waitlistEntry.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "asc" },
      include: { customer: true, resource: true },
    });
    return { entries };
  });

  app.post("/booking/waitlist", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        moduleId: z.string(),
        customerId: z.string(),
        resourceId: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const entry = await joinWaitlist({
        tenantId: req.tenantId!,
        moduleId: body.moduleId,
        customerId: body.customerId,
        resourceId: body.resourceId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { entry };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/booking/audit-events", { preHandler: staffAdmin }, async (req) => {
    const events = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId!,
        OR: [
          {
            action: {
              startsWith: "booking.",
            },
          },
          {
            action: {
              in: [
                "schedule.created",
                "resource.created",
                "resource.updated",
                "policy.updated",
                "blackout.created",
                "waitlist.joined",
                "waitlist.promoted",
                "category.created",
              ],
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { events };
  });

  // Guest surfaces
  const guestPre = requireGuest;

  app.get("/guest/booking/resources", { preHandler: guestPre }, async (req) => {
    const q = req.query as { moduleId?: string };
    const resources = await prisma.bookableResource.findMany({
      where: {
        tenantId: req.tenantId!,
        status: "available",
        ...(q.moduleId ? { moduleId: q.moduleId } : {}),
      },
      orderBy: { name: "asc" },
    });
    return { resources: resources.map(mapResource) };
  });

  app.get("/guest/booking/availability", { preHandler: guestPre }, async (req, reply) => {
    const q = z
      .object({
        resourceId: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
      })
      .parse(req.query);
    try {
      return await checkAvailability({
        tenantId: req.tenantId!,
        resourceId: q.resourceId,
        startsAt: new Date(q.startsAt),
        endsAt: new Date(q.endsAt),
      });
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/guest/booking/bookings", { preHandler: guestPre }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        moduleId: z.string(),
        resourceId: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const booking = await createBooking({
        tenantId: req.tenantId!,
        moduleId: body.moduleId,
        customerId: auth.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        status: "confirmed",
        items: [{ resourceId: body.resourceId }],
        actorKind: "guest",
        actorId: auth.customerId,
        allowWaitlistFallback: body.joinWaitlistIfUnavailable ?? true,
      });
      return { booking: mapBooking(booking) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.get("/guest/booking/bookings", { preHandler: guestPre }, async (req) => {
    const auth = req.auth as GuestAuth;
    const bookings = await prisma.booking.findMany({
      where: { tenantId: req.tenantId!, customerId: auth.customerId },
      orderBy: { startsAt: "desc" },
      include: { items: true, timeline: { orderBy: { createdAt: "asc" } } },
    });
    return {
      bookings: bookings.map((b) => ({
        ...mapBooking(b),
        items: b.items,
        timeline: b.timeline,
      })),
    };
  });

  app.patch("/guest/booking/bookings/:id", { preHandler: guestPre }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const existing = await prisma.booking.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: auth.customerId },
    });
    if (!existing) return tenantNotFound(reply);
    const body = z
      .object({
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(req.body);
    try {
      const booking = await updateBooking({
        tenantId: req.tenantId!,
        bookingId: id,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        notes: body.notes,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { booking: mapBooking(booking) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/guest/booking/bookings/:id/cancel", { preHandler: guestPre }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const existing = await prisma.booking.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: auth.customerId },
    });
    if (!existing) return tenantNotFound(reply);
    try {
      const booking = await cancelBooking({
        tenantId: req.tenantId!,
        bookingId: id,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { booking: mapBooking(booking) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/guest/booking/waitlist", { preHandler: guestPre }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        moduleId: z.string(),
        resourceId: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const entry = await joinWaitlist({
        tenantId: req.tenantId!,
        moduleId: body.moduleId,
        customerId: auth.customerId,
        resourceId: body.resourceId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { entry };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });
}
