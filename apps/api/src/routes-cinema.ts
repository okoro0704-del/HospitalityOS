import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  SCREEN_TYPES,
  SHOWTIME_STATUSES,
  SEATING_MODES,
  CONTENT_RATINGS,
  CONCESSION_ORDER_STATUSES,
} from "@hospitalityos/shared";
import { prisma } from "./db.js";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireCinemaModule } from "./lib/module-gate.js";
import {
  bookCinemaTicket,
  cancelCinemaTicket,
  checkInCinemaAttendee,
  configureSeatMap,
  createCinemaContent,
  createCinemaScreen,
  createCinemaTicketType,
  createCinemaVenue,
  createConcession,
  createConcessionOrder,
  createShowtime,
  holdSeat,
  openShowtimeForSale,
  releaseExpiredHolds,
  updateConcessionOrderStatus,
} from "./services/cinema.js";

function mapErr(err: unknown) {
  const e = err as { statusCode?: number; code?: string; message?: string; waitlistId?: string };
  const status = e.statusCode ?? 500;
  return {
    status,
    body: {
      error: e.code ?? "internal_error",
      message: e.message ?? "Unexpected error",
      ...(e.waitlistId ? { waitlistId: e.waitlistId } : {}),
    },
  };
}

async function staffPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireCinemaModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireCinemaModule(req, reply);
  };
}

async function guestPre() {
  return async (req: Parameters<typeof requireGuest>[0], reply: Parameters<typeof requireGuest>[1]) => {
    await requireGuest(req, reply);
    if (reply.sent) return;
    await requireCinemaModule(req, reply);
  };
}

export async function registerCinemaRoutes(app: FastifyInstance) {
  const staffAny = await staffPre();
  const staffOps = await staffPre([
    "owner",
    "admin",
    "manager",
    "cinema_manager",
    "front_desk",
    "operations",
    "projection_staff",
    "reception",
  ]);
  const staffAdmin = await staffPre(["owner", "admin", "manager", "cinema_manager"]);
  const staffCheckIn = await staffPre([
    "owner",
    "admin",
    "manager",
    "cinema_manager",
    "front_desk",
    "checkin_staff",
    "projection_staff",
    "reception",
  ]);
  const staffConcession = await staffPre([
    "owner",
    "admin",
    "manager",
    "cinema_manager",
    "concession_staff",
    "front_desk",
    "operations",
  ]);
  const guest = await guestPre();

  app.get("/cinema/dashboard", { preHandler: staffAny }, async (req) => {
    const tenantId = req.tenantId!;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [onSale, screens, ticketsToday, holds, orders] = await Promise.all([
      prisma.cinemaShowtime.count({
        where: { tenantId, status: { in: ["on_sale", "scheduled"] } },
      }),
      prisma.cinemaScreen.count({ where: { tenantId, status: "active" } }),
      prisma.cinemaTicket.count({
        where: { tenantId, bookedAt: { gte: since }, status: { not: "cancelled" } },
      }),
      prisma.cinemaSeatHold.count({ where: { tenantId, status: "active" } }),
      prisma.cinemaConcessionOrder.count({
        where: { tenantId, status: { in: ["submitted", "preparing", "ready"] } },
      }),
    ]);
    return { onSale, screens, ticketsToday, activeHolds: holds, openOrders: orders };
  });

  app.get("/cinema/venues", { preHandler: staffAny }, async (req) => {
    const venues = await prisma.cinemaVenue.findMany({
      where: { tenantId: req.tenantId! },
      include: { screens: true },
      orderBy: { name: "asc" },
    });
    return { venues };
  });

  app.post("/cinema/venues", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        location: z.string().optional(),
      })
      .parse(req.body);
    try {
      const venue = await createCinemaVenue({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ venue });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/cinema/screens", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        venueId: z.string().min(1),
        name: z.string().min(1),
        code: z.string().min(1),
        screenType: z.enum(SCREEN_TYPES).optional(),
        capacity: z.number().int().positive().optional(),
        seatingMode: z.enum(SEATING_MODES).optional(),
      })
      .parse(req.body);
    try {
      const screen = await createCinemaScreen({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ screen });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/cinema/screens", { preHandler: staffAny }, async (req) => {
    const screens = await prisma.cinemaScreen.findMany({
      where: { tenantId: req.tenantId! },
      include: { venue: true, seatMap: { include: { sections: { include: { seats: true } } } } },
      orderBy: { name: "asc" },
    });
    return { screens };
  });

  app.post("/cinema/seats/maps", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        screenId: z.string().min(1),
        name: z.string().min(1),
        sections: z.array(
          z.object({
            name: z.string().min(1),
            code: z.string().min(1),
            seats: z.array(
              z.object({
                label: z.string().min(1),
                rowLabel: z.string().optional(),
                seatType: z.string().optional(),
                accessible: z.boolean().optional(),
                premium: z.boolean().optional(),
                vip: z.boolean().optional(),
              }),
            ),
          }),
        ),
      })
      .parse(req.body);
    try {
      const seatMap = await configureSeatMap({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ seatMap });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/cinema/content", { preHandler: staffAny }, async (req) => {
    const content = await prisma.cinemaContent.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { title: "asc" },
    });
    return { content };
  });

  app.post("/cinema/content", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        title: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        runtimeMinutes: z.number().int().positive().optional(),
        genre: z.string().optional(),
        category: z.string().optional(),
        rating: z.enum(CONTENT_RATINGS).optional(),
        language: z.string().optional(),
        subtitles: z.string().optional(),
        posterUrl: z.string().optional(),
        trailerUrl: z.string().optional(),
      })
      .parse(req.body);
    try {
      const content = await createCinemaContent({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ content });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/cinema/showtimes", { preHandler: staffAny }, async (req) => {
    const showtimes = await prisma.cinemaShowtime.findMany({
      where: { tenantId: req.tenantId! },
      include: {
        content: true,
        screen: true,
        ticketTypes: true,
      },
      orderBy: { startsAt: "asc" },
    });
    return { showtimes };
  });

  app.post("/cinema/showtimes", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        contentId: z.string().min(1),
        screenId: z.string().min(1),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        capacity: z.number().int().positive().optional(),
        seatingMode: z.enum(SEATING_MODES).optional(),
      })
      .parse(req.body);
    try {
      const showtime = await createShowtime({
        tenantId: req.tenantId!,
        contentId: body.contentId,
        screenId: body.screenId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        capacity: body.capacity,
        seatingMode: body.seatingMode,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ showtime });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/cinema/showtimes/:id/open", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const showtime = await openShowtimeForSale({
        tenantId: req.tenantId!,
        showtimeId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { showtime };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.patch("/cinema/showtimes/:id/status", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(SHOWTIME_STATUSES) }).parse(req.body);
    const showtime = await prisma.cinemaShowtime.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!showtime) return reply.code(404).send({ error: "not_found", message: "Showtime not found" });
    const updated = await prisma.cinemaShowtime.update({
      where: { id },
      data: { status: body.status },
    });
    return { showtime: updated };
  });

  app.post("/cinema/tickets/types", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        showtimeId: z.string().min(1),
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        capacity: z.number().int().positive().optional(),
      })
      .parse(req.body);
    try {
      const ticketType = await createCinemaTicketType({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ ticketType });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/cinema/tickets", { preHandler: staffAny }, async (req) => {
    const tickets = await prisma.cinemaTicket.findMany({
      where: { tenantId: req.tenantId! },
      include: { ticketType: true, seat: true, attendee: true, showtime: { include: { content: true } } },
      orderBy: { bookedAt: "desc" },
      take: 200,
    });
    return { tickets };
  });

  app.post("/cinema/tickets/book", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        showtimeId: z.string().min(1),
        ticketTypeId: z.string().min(1),
        customerId: z.string().optional(),
        seatId: z.string().optional(),
        sessionKey: z.string().optional(),
        holderName: z.string().optional(),
        holderEmail: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const ticket = await bookCinemaTicket({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ ticket });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/cinema/holds", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        showtimeId: z.string().min(1),
        seatId: z.string().min(1),
        sessionKey: z.string().min(1),
        customerId: z.string().optional(),
        holdMinutes: z.number().int().positive().optional(),
      })
      .parse(req.body);
    try {
      const hold = await holdSeat({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ hold });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/cinema/holds/release-expired", { preHandler: staffOps }, async (req) => {
    const released = await releaseExpiredHolds(req.tenantId!);
    return { released };
  });

  app.get("/cinema/attendees", { preHandler: staffAny }, async (req) => {
    const attendees = await prisma.cinemaAttendee.findMany({
      where: { tenantId: req.tenantId! },
      include: { ticket: true, showtime: { include: { content: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { attendees };
  });

  app.post("/cinema/check-in", { preHandler: staffCheckIn }, async (req, reply) => {
    const body = z
      .object({
        ticketId: z.string().min(1),
        source: z.string().optional(),
      })
      .parse(req.body);
    try {
      const checkIn = await checkInCinemaAttendee({
        tenantId: req.tenantId!,
        ticketId: body.ticketId,
        staffId: (req.auth as StaffAuth).staffId,
        source: body.source,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ checkIn });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/cinema/check-in", { preHandler: staffAny }, async (req) => {
    const checkIns = await prisma.cinemaCheckIn.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { checkedInAt: "desc" },
      take: 100,
    });
    return { checkIns };
  });

  app.get("/cinema/concessions", { preHandler: staffAny }, async (req) => {
    const concessions = await prisma.cinemaConcession.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { concessions };
  });

  app.post("/cinema/concessions", { preHandler: staffConcession }, async (req, reply) => {
    const body = z
      .object({
        venueId: z.string().optional(),
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        price: z.number().nonnegative().optional(),
      })
      .parse(req.body);
    try {
      const concession = await createConcession({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ concession });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/cinema/orders", { preHandler: staffAny }, async (req) => {
    const orders = await prisma.cinemaConcessionOrder.findMany({
      where: { tenantId: req.tenantId! },
      include: { items: { include: { concession: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { orders };
  });

  app.post("/cinema/orders", { preHandler: staffConcession }, async (req, reply) => {
    const body = z
      .object({
        venueId: z.string().optional(),
        customerId: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            concessionId: z.string().min(1),
            quantity: z.number().int().positive(),
            notes: z.string().optional(),
          }),
        ),
      })
      .parse(req.body);
    try {
      const order = await createConcessionOrder({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ order });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.patch("/cinema/orders/:id/status", { preHandler: staffConcession }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(CONCESSION_ORDER_STATUSES) }).parse(req.body);
    try {
      const order = await updateConcessionOrderStatus({
        tenantId: req.tenantId!,
        orderId: id,
        status: body.status,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { order };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/cinema/shifts", { preHandler: staffAny }, async (req) => {
    const shifts = await prisma.cinemaShift.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { startsAt: "desc" },
      take: 50,
    });
    return { shifts };
  });

  app.post("/cinema/shifts", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        venueId: z.string().optional(),
        staffId: z.string().min(1),
        roleLabel: z.string().optional(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const shift = await prisma.cinemaShift.create({
      data: {
        tenantId: req.tenantId!,
        venueId: body.venueId ?? null,
        staffId: body.staffId,
        roleLabel: body.roleLabel ?? "operations",
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        notes: body.notes ?? null,
        status: "active",
      },
    });
    return reply.code(201).send({ shift });
  });

  /* ── Guest ─────────────────────────────────────────────────── */

  app.get("/guest/cinema", { preHandler: guest }, async (req) => {
    const [venues, content, showtimes] = await Promise.all([
      prisma.cinemaVenue.findMany({
        where: { tenantId: req.tenantId!, status: "active" },
        include: { screens: { where: { status: "active" } } },
      }),
      prisma.cinemaContent.findMany({
        where: { tenantId: req.tenantId!, status: "active" },
        orderBy: { title: "asc" },
      }),
      prisma.cinemaShowtime.findMany({
        where: {
          tenantId: req.tenantId!,
          status: { in: ["on_sale", "scheduled", "sold_out"] },
          startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        include: { content: true, screen: true, ticketTypes: true },
        orderBy: { startsAt: "asc" },
        take: 50,
      }),
    ]);
    return { venues, content, showtimes };
  });

  app.get("/guest/cinema/content/:id", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const content = await prisma.cinemaContent.findFirst({
      where: { id, tenantId: req.tenantId!, status: "active" },
      include: {
        showtimes: {
          where: { status: { in: ["on_sale", "scheduled", "sold_out"] } },
          include: { screen: true, ticketTypes: true },
          orderBy: { startsAt: "asc" },
        },
      },
    });
    if (!content) return reply.code(404).send({ error: "not_found", message: "Content not found" });
    return { content };
  });

  app.get("/guest/cinema/showtimes/:id", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await releaseExpiredHolds(req.tenantId!);
    const showtime = await prisma.cinemaShowtime.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: {
        content: true,
        screen: {
          include: { seatMap: { include: { sections: { include: { seats: true } } } } },
        },
        ticketTypes: true,
      },
    });
    if (!showtime) return reply.code(404).send({ error: "not_found", message: "Showtime not found" });
    return { showtime };
  });

  app.get("/guest/cinema/showtimes/:id/seats", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await releaseExpiredHolds(req.tenantId!);
    const showtime = await prisma.cinemaShowtime.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: {
        screen: {
          include: { seatMap: { include: { sections: { include: { seats: true } } } } },
        },
      },
    });
    if (!showtime) return reply.code(404).send({ error: "not_found", message: "Showtime not found" });
    return { showtimeId: showtime.id, seatMap: showtime.screen.seatMap };
  });

  app.post("/guest/cinema/holds", { preHandler: guest }, async (req, reply) => {
    const body = z
      .object({
        showtimeId: z.string().min(1),
        seatId: z.string().min(1),
        sessionKey: z.string().min(1),
        holdMinutes: z.number().int().positive().optional(),
      })
      .parse(req.body);
    try {
      const hold = await holdSeat({
        tenantId: req.tenantId!,
        showtimeId: body.showtimeId,
        seatId: body.seatId,
        sessionKey: body.sessionKey,
        customerId: (req.auth as GuestAuth).customerId,
        holdMinutes: body.holdMinutes,
        actorKind: "guest",
        actorId: (req.auth as GuestAuth).customerId,
      });
      return reply.code(201).send({ hold });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/guest/cinema/tickets", { preHandler: guest }, async (req, reply) => {
    const body = z
      .object({
        showtimeId: z.string().min(1),
        ticketTypeId: z.string().min(1),
        seatId: z.string().optional(),
        sessionKey: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const ticket = await bookCinemaTicket({
        tenantId: req.tenantId!,
        showtimeId: body.showtimeId,
        ticketTypeId: body.ticketTypeId,
        seatId: body.seatId,
        sessionKey: body.sessionKey,
        customerId: (req.auth as GuestAuth).customerId,
        joinWaitlistIfUnavailable: body.joinWaitlistIfUnavailable,
        actorKind: "guest",
        actorId: (req.auth as GuestAuth).customerId,
      });
      return reply.code(201).send({ ticket });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/guest/cinema/tickets", { preHandler: guest }, async (req) => {
    const tickets = await prisma.cinemaTicket.findMany({
      where: { tenantId: req.tenantId!, customerId: (req.auth as GuestAuth).customerId },
      include: {
        ticketType: true,
        seat: true,
        showtime: { include: { content: true, screen: true } },
      },
      orderBy: { bookedAt: "desc" },
    });
    return { tickets };
  });

  app.post("/guest/cinema/tickets/:id/cancel", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.cinemaTicket.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: (req.auth as GuestAuth).customerId },
    });
    if (!existing) return reply.code(404).send({ error: "not_found", message: "Ticket not found" });
    try {
      const ticket = await cancelCinemaTicket({
        tenantId: req.tenantId!,
        ticketId: id,
        actorKind: "guest",
        actorId: (req.auth as GuestAuth).customerId,
      });
      return { ticket };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });
}
