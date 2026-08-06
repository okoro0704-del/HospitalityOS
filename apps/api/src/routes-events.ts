import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EVENT_STATUSES, VENUE_TYPES, SEATING_MODES } from "@hospitalityos/shared";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireEventsModule } from "./lib/module-gate.js";
import { prisma } from "./db.js";
import { writeAudit } from "./lib/audit.js";
import {
  bookEventTicket,
  bookVenueRental,
  cancelEventTicket,
  checkInAttendee,
  createEventAddon,
  createEventPackage,
  createEventSession,
  createEventTicketType,
  ensureVenueResource,
  publishEvent,
} from "./services/events.js";

async function staffPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireEventsModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireEventsModule(req, reply);
  };
}

async function guestPre() {
  return async (req: Parameters<typeof requireGuest>[0], reply: Parameters<typeof requireGuest>[1]) => {
    await requireGuest(req, reply);
    if (reply.sent) return;
    await requireEventsModule(req, reply);
  };
}

export async function registerEventsRoutes(app: FastifyInstance) {
  const staffAny = await staffPre();
  const staffOps = await staffPre([
    "owner",
    "admin",
    "manager",
    "event_manager",
    "venue_manager",
    "front_desk",
    "reception",
    "operations",
    "event_staff",
    "checkin_staff",
  ]);
  const staffAdmin = await staffPre(["owner", "admin", "manager", "event_manager", "venue_manager"]);
  const staffCheckIn = await staffPre([
    "owner",
    "admin",
    "manager",
    "event_manager",
    "event_staff",
    "checkin_staff",
    "front_desk",
    "reception",
  ]);
  const guest = await guestPre();

  app.get("/events/dashboard", { preHandler: staffAny }, async (req) => {
    const tenantId = req.tenantId!;
    const [openEvents, venues, ticketsToday, waitlist] = await Promise.all([
      prisma.event.count({ where: { tenantId, status: { in: ["published", "open"] } } }),
      prisma.eventVenue.count({ where: { tenantId } }),
      prisma.eventTicket.count({
        where: {
          tenantId,
          bookedAt: { gte: new Date(Date.now() - 24 * 3600000) },
          status: { not: "cancelled" },
        },
      }),
      prisma.eventWaitlist.count({ where: { tenantId, status: "waiting" } }),
    ]);
    return { openEvents, venues, ticketsToday, waitlist };
  });

  // Venues
  app.get("/venues", { preHandler: staffAny }, async (req) => {
    const venues = await prisma.eventVenue.findMany({
      where: { tenantId: req.tenantId! },
      include: { areas: true },
      orderBy: { name: "asc" },
    });
    return { venues };
  });

  app.post("/venues", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        venueType: z.enum(VENUE_TYPES).optional(),
        capacity: z.number().int().positive().optional(),
        location: z.string().optional(),
        amenities: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const venue = await prisma.eventVenue.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        venueType: body.venueType ?? "ballroom",
        capacity: body.capacity ?? 100,
        location: body.location,
        amenities: body.amenities ?? [],
        imageUrls: [],
        metadata: {},
        status: "active",
      },
    });
    await ensureVenueResource({ tenantId: req.tenantId!, venueId: venue.id });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "event_venue.created",
      resource: "event_venue",
      resourceId: venue.id,
    });
    return { venue: await prisma.eventVenue.findUniqueOrThrow({ where: { id: venue.id } }) };
  });

  app.post("/venues/:id/areas", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const venue = await prisma.eventVenue.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!venue) return tenantNotFound(reply);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        capacity: z.number().int().positive().optional(),
        description: z.string().optional(),
      })
      .parse(req.body);
    const area = await prisma.venueArea.create({
      data: {
        tenantId: req.tenantId!,
        venueId: id,
        name: body.name,
        code: body.code,
        capacity: body.capacity ?? 50,
        description: body.description,
        status: "active",
        metadata: {},
      },
    });
    return { area };
  });

  app.post("/venues/rentals", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        venueId: z.string(),
        areaId: z.string().optional(),
        customerId: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookVenueRental({
        tenantId: req.tenantId!,
        venueId: body.venueId,
        areaId: body.areaId,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Events
  app.get("/events", { preHandler: staffAny }, async (req) => {
    const events = await prisma.event.findMany({
      where: { tenantId: req.tenantId! },
      include: { venue: true, eventType: true, ticketTypes: true, sessions: true },
      orderBy: { startsAt: "asc" },
    });
    return { events };
  });

  app.post("/events", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        venueId: z.string().optional(),
        eventTypeId: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        capacity: z.number().int().positive().optional(),
        seatingMode: z.enum(SEATING_MODES).optional(),
        terms: z.string().optional(),
      })
      .parse(req.body);
    const event = await prisma.event.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        venueId: body.venueId,
        eventTypeId: body.eventTypeId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        capacity: body.capacity ?? 100,
        seatingMode: body.seatingMode ?? "general_admission",
        terms: body.terms,
        imageUrls: [],
        metadata: {},
        status: "draft",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "event.created",
      resource: "event",
      resourceId: event.id,
    });
    return { event };
  });

  app.post("/events/:id/publish", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const event = await publishEvent({
        tenantId: req.tenantId!,
        eventId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { event };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.patch("/events/:id/status", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(EVENT_STATUSES) }).parse(req.body);
    const existing = await prisma.event.findFirst({ where: { id, tenantId: req.tenantId! } });
    if (!existing) return tenantNotFound(reply);
    const event = await prisma.event.update({ where: { id }, data: { status: body.status } });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "event.status_changed",
      resource: "event",
      resourceId: id,
      metadata: { status: body.status },
    });
    return { event };
  });

  app.post("/events/types", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional() })
      .parse(req.body);
    const eventType = await prisma.eventType.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        status: "active",
      },
    });
    return { eventType };
  });

  app.post("/events/:id/sessions", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        startsAt: z.string(),
        endsAt: z.string(),
        venueId: z.string().optional(),
        areaId: z.string().optional(),
        capacity: z.number().int().positive().optional(),
      })
      .parse(req.body);
    try {
      const session = await createEventSession({
        tenantId: req.tenantId!,
        eventId: id,
        name: body.name,
        code: body.code,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        venueId: body.venueId,
        areaId: body.areaId,
        capacity: body.capacity,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { session };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Tickets
  app.get("/tickets/types", { preHandler: staffAny }, async (req) => {
    const q = req.query as { eventId?: string };
    const ticketTypes = await prisma.eventTicketType.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.eventId ? { eventId: q.eventId } : {}),
      },
      orderBy: { name: "asc" },
    });
    return { ticketTypes };
  });

  app.post("/tickets/types", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        eventId: z.string(),
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        capacity: z.number().int().positive().optional(),
        salesStart: z.string().optional(),
        salesEnd: z.string().optional(),
      })
      .parse(req.body);
    try {
      const ticketType = await createEventTicketType({
        tenantId: req.tenantId!,
        eventId: body.eventId,
        name: body.name,
        code: body.code,
        description: body.description,
        price: body.price,
        capacity: body.capacity,
        salesStart: body.salesStart ? new Date(body.salesStart) : null,
        salesEnd: body.salesEnd ? new Date(body.salesEnd) : null,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { ticketType };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/tickets/book", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        eventId: z.string(),
        ticketTypeId: z.string(),
        customerId: z.string().optional(),
        seatId: z.string().optional(),
        holderName: z.string().optional(),
        holderEmail: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const ticket = await bookEventTicket({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { ticket };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.get("/tickets", { preHandler: staffAny }, async (req) => {
    const tickets = await prisma.eventTicket.findMany({
      where: { tenantId: req.tenantId! },
      include: { ticketType: true, attendee: true, seat: true, event: true },
      orderBy: { bookedAt: "desc" },
      take: 200,
    });
    return { tickets };
  });

  // Seating
  app.post("/seating/plans", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        eventId: z.string(),
        name: z.string().min(1),
        venueId: z.string().optional(),
        sections: z
          .array(
            z.object({
              name: z.string(),
              code: z.string(),
              seats: z.array(z.object({ label: z.string(), rowLabel: z.string().optional() })),
            }),
          )
          .optional(),
      })
      .parse(req.body);
    const event = await prisma.event.findFirst({
      where: { id: body.eventId, tenantId: req.tenantId! },
    });
    if (!event) return tenantNotFound(reply);
    await prisma.event.update({
      where: { id: event.id },
      data: { seatingMode: "assigned" },
    });
    const plan = await prisma.seatingPlan.create({
      data: {
        tenantId: req.tenantId!,
        eventId: event.id,
        venueId: body.venueId ?? event.venueId,
        name: body.name,
        status: "active",
        sections: body.sections
          ? {
              create: body.sections.map((s, i) => ({
                tenantId: req.tenantId!,
                name: s.name,
                code: s.code,
                sortOrder: i,
                seats: {
                  create: s.seats.map((seat) => ({
                    tenantId: req.tenantId!,
                    label: seat.label,
                    rowLabel: seat.rowLabel,
                    status: "available",
                    metadata: {},
                  })),
                },
              })),
            }
          : undefined,
      },
      include: { sections: { include: { seats: true } } },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "seating_plan.created",
      resource: "seating_plan",
      resourceId: plan.id,
    });
    return { plan };
  });

  app.get("/seating/plans/:eventId", { preHandler: staffAny }, async (req, reply) => {
    const { eventId } = req.params as { eventId: string };
    const plan = await prisma.seatingPlan.findFirst({
      where: { eventId, tenantId: req.tenantId! },
      include: { sections: { include: { seats: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!plan) return tenantNotFound(reply);
    return { plan };
  });

  // Attendees & check-in
  app.get("/attendees", { preHandler: staffAny }, async (req) => {
    const q = req.query as { eventId?: string };
    const attendees = await prisma.eventAttendee.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.eventId ? { eventId: q.eventId } : {}),
      },
      include: { ticket: true },
      orderBy: { displayName: "asc" },
    });
    return { attendees };
  });

  app.post("/check-in", { preHandler: staffCheckIn }, async (req, reply) => {
    const body = z.object({ ticketId: z.string() }).parse(req.body);
    try {
      const checkIn = await checkInAttendee({
        tenantId: req.tenantId!,
        ticketId: body.ticketId,
        staffId: (req.auth as StaffAuth).staffId,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { checkIn };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/check-in", { preHandler: staffAny }, async (req) => {
    const q = req.query as { eventId?: string };
    const checkIns = await prisma.eventCheckIn.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.eventId ? { eventId: q.eventId } : {}),
      },
      orderBy: { checkedInAt: "desc" },
      take: 200,
    });
    return { checkIns };
  });

  // Packages & add-ons
  app.get("/events/packages", { preHandler: staffAny }, async (req) => {
    const packages = await prisma.eventPackage.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { packages };
  });

  app.post("/events/packages", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        eventId: z.string().optional(),
        items: z.array(z.unknown()).optional(),
      })
      .parse(req.body);
    try {
      const pkg = await createEventPackage({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { package: pkg };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/events/addons", { preHandler: staffAny }, async (req) => {
    const addons = await prisma.eventAddon.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { addons };
  });

  app.post("/events/addons", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        eventId: z.string().optional(),
      })
      .parse(req.body);
    try {
      const addon = await createEventAddon({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { addon };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/waitlist", { preHandler: staffAny }, async (req) => {
    const entries = await prisma.eventWaitlist.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "asc" },
    });
    return { entries };
  });

  // ── Guest ────────────────────────────────────────────────────
  app.get("/guest/events", { preHandler: guest }, async (req) => {
    const q = req.query as { q?: string; type?: string };
    const events = await prisma.event.findMany({
      where: {
        tenantId: req.tenantId!,
        status: { in: ["published", "open", "sold_out"] },
        ...(q.q
          ? {
              OR: [
                { name: { contains: q.q } },
                { description: { contains: q.q } },
              ],
            }
          : {}),
        ...(q.type ? { eventType: { code: q.type } } : {}),
      },
      include: { venue: true, eventType: true, ticketTypes: true },
      orderBy: { startsAt: "asc" },
    });
    return { events };
  });

  app.get("/guest/events/mine", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const tickets = await prisma.eventTicket.findMany({
      where: {
        tenantId: req.tenantId!,
        customerId: auth.customerId,
        status: { not: "cancelled" },
      },
      include: { event: true },
      orderBy: { bookedAt: "desc" },
    });
    const eventIds = [...new Set(tickets.map((t) => t.eventId))];
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds }, tenantId: req.tenantId! },
      orderBy: { startsAt: "asc" },
    });
    return { events, tickets };
  });

  app.get("/guest/events/:id", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await prisma.event.findFirst({
      where: {
        id,
        tenantId: req.tenantId!,
        status: { in: ["published", "open", "sold_out", "in_progress", "completed"] },
      },
      include: {
        venue: { include: { areas: true } },
        eventType: true,
        ticketTypes: true,
        sessions: true,
        packages: true,
        addons: true,
      },
    });
    if (!event) return tenantNotFound(reply);
    return { event };
  });

  app.get("/guest/events/:id/tickets", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!event) return tenantNotFound(reply);
    const ticketTypes = await prisma.eventTicketType.findMany({
      where: { eventId: id, tenantId: req.tenantId!, status: "active" },
    });
    return {
      ticketTypes: ticketTypes.map((t) => ({
        ...t,
        remaining: Math.max(0, t.capacity - t.soldCount),
      })),
      eventRemaining: Math.max(0, event.capacity - event.soldCount),
    };
  });

  app.get("/guest/events/:id/seating", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const plan = await prisma.seatingPlan.findFirst({
      where: { eventId: id, tenantId: req.tenantId! },
      include: { sections: { include: { seats: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!plan) return { plan: null };
    return {
      plan: {
        ...plan,
        sections: plan.sections.map((s) => ({
          ...s,
          seats: s.seats.map((seat) => ({
            id: seat.id,
            label: seat.label,
            rowLabel: seat.rowLabel,
            status: seat.status,
            available: seat.status === "available",
          })),
        })),
      },
    };
  });

  app.post("/guest/tickets", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        eventId: z.string(),
        ticketTypeId: z.string(),
        seatId: z.string().optional(),
        holderName: z.string().optional(),
        holderEmail: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const ticket = await bookEventTicket({
        tenantId: req.tenantId!,
        eventId: body.eventId,
        ticketTypeId: body.ticketTypeId,
        seatId: body.seatId,
        customerId: auth.customerId,
        holderName: body.holderName ?? auth.displayName ?? "Guest",
        holderEmail: body.holderEmail,
        joinWaitlistIfUnavailable: body.joinWaitlistIfUnavailable ?? true,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { ticket };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.get("/guest/tickets", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const tickets = await prisma.eventTicket.findMany({
      where: { tenantId: req.tenantId!, customerId: auth.customerId },
      include: { event: true, ticketType: true, seat: true },
      orderBy: { bookedAt: "desc" },
    });
    return { tickets };
  });

  app.post("/guest/tickets/:id/cancel", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const existing = await prisma.eventTicket.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: auth.customerId },
    });
    if (!existing) return tenantNotFound(reply);
    try {
      const ticket = await cancelEventTicket({
        tenantId: req.tenantId!,
        ticketId: id,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { ticket };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });
}
