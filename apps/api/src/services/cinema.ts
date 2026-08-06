import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { createBooking, ensureDefaultCategories } from "./booking-engine.js";
import { createOffering, ensureDefaultCatalog } from "./commerce-engine.js";

const DEFAULT_HOLD_MINUTES = 10;

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function ensureEntertainmentCategory(tenantId: string) {
  await ensureDefaultCategories(tenantId);
  return prisma.resourceCategory.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "entertainment" } },
  });
}

export async function ensureScreenResource(opts: { tenantId: string; screenId: string }) {
  const screen = await prisma.cinemaScreen.findFirst({
    where: { id: opts.screenId, tenantId: opts.tenantId },
  });
  if (!screen) throw httpError("Screen not found", "not_found", 404);
  if (screen.bookableResourceId) return screen.bookableResourceId;

  const category = await ensureEntertainmentCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "cinema",
      name: `Screen: ${screen.name}`,
      code: `SCR-${screen.id.slice(-8)}`,
      capacity: screen.capacity,
      status: "available",
      tags: ["cinema", "screen", screen.screenType],
      metadata: { screenId: screen.id, venueId: screen.venueId },
      customFields: {},
      sourceType: "cinema_screen",
      sourceId: screen.id,
    },
  });
  await prisma.cinemaScreen.update({
    where: { id: screen.id },
    data: { bookableResourceId: resource.id },
  });
  return resource.id;
}

/** Release expired seat holds (server-authoritative). */
export async function releaseExpiredHolds(tenantId?: string) {
  const now = new Date();
  const expired = await prisma.cinemaSeatHold.findMany({
    where: {
      status: "active",
      expiresAt: { lte: now },
      ...(tenantId ? { tenantId } : {}),
    },
  });
  for (const hold of expired) {
    await prisma.$executeRaw`
      UPDATE CinemaSeat
      SET status = 'available', holdSessionId = NULL
      WHERE id = ${hold.seatId} AND status = 'held'
    `;
    await prisma.cinemaSeatHold.update({
      where: { id: hold.id },
      data: { status: "expired" },
    });
  }
  return expired.length;
}

async function claimTicketCapacity(ticketTypeId: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE CinemaTicketType
    SET soldCount = soldCount + 1, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${ticketTypeId}
      AND status = 'active'
      AND soldCount < capacity
  `;
  return Number(result) === 1;
}

async function releaseTicketCapacity(ticketTypeId: string) {
  await prisma.$executeRaw`
    UPDATE CinemaTicketType
    SET soldCount = CASE WHEN soldCount > 0 THEN soldCount - 1 ELSE 0 END,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${ticketTypeId}
  `;
}

async function claimShowtimeCapacity(showtimeId: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE CinemaShowtime
    SET soldCount = soldCount + 1, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${showtimeId}
      AND soldCount < capacity
      AND status IN ('scheduled', 'on_sale', 'sold_out')
  `;
  return Number(result) === 1;
}

async function releaseShowtimeCapacity(showtimeId: string) {
  await prisma.$executeRaw`
    UPDATE CinemaShowtime
    SET soldCount = CASE WHEN soldCount > 0 THEN soldCount - 1 ELSE 0 END,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${showtimeId}
  `;
}

/** Claim seat if available (or held by this session). */
async function claimSeat(seatId: string, sessionKey?: string | null): Promise<boolean> {
  if (sessionKey) {
    const fromHold = await prisma.$executeRaw`
      UPDATE CinemaSeat
      SET status = 'booked', holdSessionId = NULL
      WHERE id = ${seatId}
        AND (
          status = 'available'
          OR (status = 'held' AND holdSessionId = ${sessionKey})
        )
    `;
    return Number(fromHold) === 1;
  }
  const result = await prisma.$executeRaw`
    UPDATE CinemaSeat
    SET status = 'booked', holdSessionId = NULL
    WHERE id = ${seatId} AND status = 'available'
  `;
  return Number(result) === 1;
}

async function maybeMarkSoldOut(showtimeId: string) {
  const st = await prisma.cinemaShowtime.findUnique({ where: { id: showtimeId } });
  if (!st) return;
  if (st.soldCount >= st.capacity && ["scheduled", "on_sale"].includes(st.status)) {
    await prisma.cinemaShowtime.update({
      where: { id: showtimeId },
      data: { status: "sold_out" },
    });
  }
}

export async function createCinemaVenue(opts: {
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  location?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const venue = await prisma.cinemaVenue.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      location: opts.location ?? null,
      amenities: [],
      imageUrls: [],
      status: "active",
      metadata: {},
    },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_venue.created",
    resource: "cinema_venue",
    resourceId: venue.id,
  });
  return venue;
}

export async function createCinemaScreen(opts: {
  tenantId: string;
  venueId: string;
  name: string;
  code: string;
  screenType?: string;
  capacity?: number;
  seatingMode?: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const venue = await prisma.cinemaVenue.findFirst({
    where: { id: opts.venueId, tenantId: opts.tenantId },
  });
  if (!venue) throw httpError("Cinema venue not found", "not_found", 404);

  const screen = await prisma.cinemaScreen.create({
    data: {
      tenantId: opts.tenantId,
      venueId: venue.id,
      name: opts.name,
      code: opts.code,
      screenType: opts.screenType ?? "standard",
      capacity: opts.capacity ?? 100,
      amenities: [],
      status: "active",
      seatingMode: opts.seatingMode ?? "assigned",
      metadata: {},
    },
  });
  await ensureScreenResource({ tenantId: opts.tenantId, screenId: screen.id });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_screen.created",
    resource: "cinema_screen",
    resourceId: screen.id,
  });
  return prisma.cinemaScreen.findUniqueOrThrow({ where: { id: screen.id } });
}

export async function configureSeatMap(opts: {
  tenantId: string;
  screenId: string;
  name: string;
  sections: Array<{
    name: string;
    code: string;
    seats: Array<{
      label: string;
      rowLabel?: string;
      seatType?: string;
      accessible?: boolean;
      premium?: boolean;
      vip?: boolean;
    }>;
  }>;
  actorKind: string;
  actorId?: string | null;
}) {
  const screen = await prisma.cinemaScreen.findFirst({
    where: { id: opts.screenId, tenantId: opts.tenantId },
  });
  if (!screen) throw httpError("Screen not found", "not_found", 404);

  const existing = await prisma.cinemaSeatMap.findUnique({ where: { screenId: screen.id } });
  if (existing) {
    await prisma.cinemaSeatMap.delete({ where: { id: existing.id } });
  }

  const seatMap = await prisma.cinemaSeatMap.create({
    data: {
      tenantId: opts.tenantId,
      screenId: screen.id,
      name: opts.name,
      status: "active",
      sections: {
        create: opts.sections.map((sec, i) => ({
          tenantId: opts.tenantId,
          name: sec.name,
          code: sec.code,
          sortOrder: i,
          seats: {
            create: sec.seats.map((s) => ({
              tenantId: opts.tenantId,
              label: s.label,
              rowLabel: s.rowLabel ?? null,
              seatType: s.seatType ?? "standard",
              accessible: s.accessible ?? false,
              premium: s.premium ?? false,
              vip: s.vip ?? false,
              status: "available",
              metadata: {},
            })),
          },
        })),
      },
    },
    include: { sections: { include: { seats: true } } },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_seat_map.configured",
    resource: "cinema_seat_map",
    resourceId: seatMap.id,
  });
  return seatMap;
}

export async function createCinemaContent(opts: {
  tenantId: string;
  title: string;
  code: string;
  description?: string | null;
  runtimeMinutes?: number;
  genre?: string | null;
  category?: string;
  rating?: string;
  language?: string | null;
  subtitles?: string | null;
  posterUrl?: string | null;
  trailerUrl?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const content = await prisma.cinemaContent.create({
    data: {
      tenantId: opts.tenantId,
      title: opts.title,
      code: opts.code,
      description: opts.description ?? null,
      runtimeMinutes: opts.runtimeMinutes ?? 120,
      genre: opts.genre ?? null,
      category: opts.category ?? "movie",
      rating: opts.rating ?? "PG",
      language: opts.language ?? null,
      subtitles: opts.subtitles ?? null,
      posterUrl: opts.posterUrl ?? null,
      trailerUrl: opts.trailerUrl ?? null,
      status: "active",
      metadata: {},
    },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_content.created",
    resource: "cinema_content",
    resourceId: content.id,
  });
  return content;
}

export async function createShowtime(opts: {
  tenantId: string;
  contentId: string;
  screenId: string;
  startsAt: Date;
  endsAt: Date;
  capacity?: number;
  seatingMode?: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const content = await prisma.cinemaContent.findFirst({
    where: { id: opts.contentId, tenantId: opts.tenantId },
  });
  if (!content) throw httpError("Content not found", "not_found", 404);
  const screen = await prisma.cinemaScreen.findFirst({
    where: { id: opts.screenId, tenantId: opts.tenantId },
  });
  if (!screen) throw httpError("Screen not found", "not_found", 404);

  const resourceId = await ensureScreenResource({
    tenantId: opts.tenantId,
    screenId: screen.id,
  });

  const showtimeResource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: (await ensureEntertainmentCategory(opts.tenantId)).id,
      moduleId: "cinema",
      name: `${content.title} @ ${screen.name}`,
      code: `ST-${Date.now().toString(36)}`,
      capacity: opts.capacity ?? screen.capacity,
      status: "available",
      tags: ["showtime", "cinema"],
      metadata: { contentId: content.id, screenId: screen.id },
      customFields: {},
      sourceType: "cinema_showtime",
      sourceId: `pending-${Date.now()}`,
    },
  });

  let booking;
  try {
    booking = await createBooking({
      tenantId: opts.tenantId,
      moduleId: "cinema",
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      partySize: opts.capacity ?? screen.capacity,
      status: "confirmed",
      notes: `Showtime: ${content.title}`,
      items: [{ resourceId, quantity: 1 }],
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    });
  } catch (err) {
    await prisma.bookableResource.delete({ where: { id: showtimeResource.id } }).catch(() => undefined);
    throw err;
  }

  const showtime = await prisma.cinemaShowtime.create({
    data: {
      tenantId: opts.tenantId,
      contentId: content.id,
      screenId: screen.id,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      capacity: opts.capacity ?? screen.capacity,
      soldCount: 0,
      seatingMode: opts.seatingMode ?? screen.seatingMode,
      status: "draft",
      bookableResourceId: showtimeResource.id,
      bookingId: booking.id,
      metadata: {},
    },
  });

  await prisma.bookableResource.update({
    where: { id: showtimeResource.id },
    data: { sourceId: showtime.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_showtime.created",
    resource: "cinema_showtime",
    resourceId: showtime.id,
    metadata: { bookingId: booking.id },
  });

  return showtime;
}

export async function openShowtimeForSale(opts: {
  tenantId: string;
  showtimeId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const showtime = await prisma.cinemaShowtime.findFirst({
    where: { id: opts.showtimeId, tenantId: opts.tenantId },
  });
  if (!showtime) throw httpError("Showtime not found", "not_found", 404);
  if (["cancelled", "completed"].includes(showtime.status)) {
    throw httpError("Showtime cannot be opened for sale", "invalid_status", 409);
  }

  const updated = await prisma.cinemaShowtime.update({
    where: { id: showtime.id },
    data: {
      status: "on_sale",
      publishedAt: showtime.publishedAt ?? new Date(),
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_showtime.on_sale",
    resource: "cinema_showtime",
    resourceId: updated.id,
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "system",
    title: "Showtime on sale",
    body: "A showtime is now open for ticket sales.",
    metadata: { showtimeId: updated.id },
  });

  return updated;
}

export async function createCinemaTicketType(opts: {
  tenantId: string;
  showtimeId: string;
  name: string;
  code: string;
  description?: string | null;
  price?: number;
  capacity?: number;
  salesStart?: Date | null;
  salesEnd?: Date | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const showtime = await prisma.cinemaShowtime.findFirst({
    where: { id: opts.showtimeId, tenantId: opts.tenantId },
    include: { content: true },
  });
  if (!showtime) throw httpError("Showtime not found", "not_found", 404);

  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "product",
    name: `${showtime.content.title} — ${opts.name}`,
    code: `CTK-${opts.code}-${Date.now().toString(36)}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "cinema",
    sku: opts.code,
    unit: "ticket",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const ticketType = await prisma.cinemaTicketType.create({
    data: {
      tenantId: opts.tenantId,
      showtimeId: showtime.id,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      price: opts.price ?? 0,
      capacity: opts.capacity ?? showtime.capacity,
      soldCount: 0,
      salesStart: opts.salesStart ?? null,
      salesEnd: opts.salesEnd ?? null,
      accessRules: {},
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_ticket_type.created",
    resource: "cinema_ticket_type",
    resourceId: ticketType.id,
    metadata: { offeringId: offering.id },
  });

  return ticketType;
}

export async function holdSeat(opts: {
  tenantId: string;
  showtimeId: string;
  seatId: string;
  sessionKey: string;
  customerId?: string | null;
  holdMinutes?: number;
  actorKind: string;
  actorId?: string | null;
}) {
  await releaseExpiredHolds(opts.tenantId);

  const showtime = await prisma.cinemaShowtime.findFirst({
    where: { id: opts.showtimeId, tenantId: opts.tenantId },
  });
  if (!showtime) throw httpError("Showtime not found", "not_found", 404);
  if (!["scheduled", "on_sale", "sold_out"].includes(showtime.status)) {
    throw httpError("Showtime is not open for seating", "showtime_closed", 409);
  }

  const seat = await prisma.cinemaSeat.findFirst({
    where: { id: opts.seatId, tenantId: opts.tenantId },
    include: { section: { include: { seatMap: true } } },
  });
  if (!seat) throw httpError("Seat not found", "not_found", 404);
  if (seat.section.seatMap.screenId !== showtime.screenId) {
    throw httpError("Seat does not belong to this showtime screen", "invalid_seat", 400);
  }

  const claimed = await prisma.$executeRaw`
    UPDATE CinemaSeat
    SET status = 'held', holdSessionId = ${opts.sessionKey}
    WHERE id = ${opts.seatId} AND status = 'available'
  `;
  if (Number(claimed) !== 1) {
    throw httpError("Seat is not available", "seat_unavailable", 409);
  }

  const expiresAt = new Date(
    Date.now() + (opts.holdMinutes ?? DEFAULT_HOLD_MINUTES) * 60_000,
  );
  const hold = await prisma.cinemaSeatHold.create({
    data: {
      tenantId: opts.tenantId,
      showtimeId: showtime.id,
      seatId: seat.id,
      sessionKey: opts.sessionKey,
      customerId: opts.customerId ?? null,
      status: "active",
      expiresAt,
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_seat.held",
    resource: "cinema_seat_hold",
    resourceId: hold.id,
    metadata: { seatId: seat.id, expiresAt: expiresAt.toISOString() },
  });

  return hold;
}

export async function bookCinemaTicket(opts: {
  tenantId: string;
  showtimeId: string;
  ticketTypeId: string;
  customerId?: string | null;
  seatId?: string | null;
  sessionKey?: string | null;
  holderName?: string | null;
  holderEmail?: string | null;
  joinWaitlistIfUnavailable?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  await releaseExpiredHolds(opts.tenantId);

  const showtime = await prisma.cinemaShowtime.findFirst({
    where: { id: opts.showtimeId, tenantId: opts.tenantId },
    include: { content: true },
  });
  if (!showtime) throw httpError("Showtime not found", "not_found", 404);
  if (!["scheduled", "on_sale", "sold_out"].includes(showtime.status)) {
    throw httpError("Showtime is not open for ticket sales", "showtime_closed", 409);
  }

  const ticketType = await prisma.cinemaTicketType.findFirst({
    where: {
      id: opts.ticketTypeId,
      tenantId: opts.tenantId,
      showtimeId: showtime.id,
    },
  });
  if (!ticketType) throw httpError("Ticket type not found", "not_found", 404);

  if (showtime.seatingMode === "assigned" && !opts.seatId) {
    throw httpError("Seat selection required", "seat_required", 400);
  }

  const typeClaimed = await claimTicketCapacity(ticketType.id);
  if (!typeClaimed) {
    if (opts.joinWaitlistIfUnavailable && opts.customerId) {
      const entry = await prisma.cinemaWaitlist.create({
        data: {
          tenantId: opts.tenantId,
          showtimeId: showtime.id,
          ticketTypeId: ticketType.id,
          customerId: opts.customerId,
          status: "waiting",
        },
      });
      throw Object.assign(new Error("Added to waitlist"), {
        code: "waitlisted",
        statusCode: 409,
        waitlistId: entry.id,
      });
    }
    throw httpError("Ticket type sold out", "sold_out", 409);
  }

  const showClaimed = await claimShowtimeCapacity(showtime.id);
  if (!showClaimed) {
    await releaseTicketCapacity(ticketType.id);
    if (opts.joinWaitlistIfUnavailable && opts.customerId) {
      const entry = await prisma.cinemaWaitlist.create({
        data: {
          tenantId: opts.tenantId,
          showtimeId: showtime.id,
          ticketTypeId: ticketType.id,
          customerId: opts.customerId,
          status: "waiting",
        },
      });
      throw Object.assign(new Error("Added to waitlist"), {
        code: "waitlisted",
        statusCode: 409,
        waitlistId: entry.id,
      });
    }
    throw httpError("Showtime sold out", "sold_out", 409);
  }

  if (opts.seatId) {
    const seatOk = await claimSeat(opts.seatId, opts.sessionKey);
    if (!seatOk) {
      await releaseTicketCapacity(ticketType.id);
      await releaseShowtimeCapacity(showtime.id);
      throw httpError("Seat unavailable", "seat_unavailable", 409);
    }
    if (opts.sessionKey) {
      await prisma.cinemaSeatHold.updateMany({
        where: {
          showtimeId: showtime.id,
          seatId: opts.seatId,
          sessionKey: opts.sessionKey,
          status: "active",
        },
        data: { status: "converted", convertedAt: new Date() },
      });
    }
  }

  const customer = opts.customerId
    ? await prisma.customer.findFirst({
        where: { id: opts.customerId, tenantId: opts.tenantId },
      })
    : null;

  const ticket = await prisma.cinemaTicket.create({
    data: {
      tenantId: opts.tenantId,
      showtimeId: showtime.id,
      ticketTypeId: ticketType.id,
      customerId: opts.customerId ?? null,
      seatId: opts.seatId ?? null,
      status: "confirmed",
      holderName: opts.holderName ?? customer?.displayName ?? null,
      holderEmail: opts.holderEmail ?? customer?.email ?? null,
      metadata: {},
    },
  });

  await prisma.cinemaAttendee.create({
    data: {
      tenantId: opts.tenantId,
      showtimeId: showtime.id,
      ticketId: ticket.id,
      customerId: opts.customerId ?? null,
      displayName: ticket.holderName ?? "Guest",
      email: ticket.holderEmail,
      checkInStatus: "not_checked_in",
      status: "registered",
    },
  });

  await maybeMarkSoldOut(showtime.id);

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_ticket.booked",
    resource: "cinema_ticket",
    resourceId: ticket.id,
  });

  if (opts.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: opts.customerId,
      title: "Ticket booked",
      body: `Your ticket for ${showtime.content.title} is confirmed.`,
      metadata: { ticketId: ticket.id, showtimeId: showtime.id },
    });
  }

  return prisma.cinemaTicket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: { attendee: true, ticketType: true, seat: true },
  });
}

export async function cancelCinemaTicket(opts: {
  tenantId: string;
  ticketId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const ticket = await prisma.cinemaTicket.findFirst({
    where: { id: opts.ticketId, tenantId: opts.tenantId },
  });
  if (!ticket) throw httpError("Ticket not found", "not_found", 404);
  if (ticket.status === "cancelled") return ticket;

  await prisma.cinemaTicket.update({
    where: { id: ticket.id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  await prisma.cinemaAttendee.updateMany({
    where: { ticketId: ticket.id },
    data: { status: "cancelled", checkInStatus: "cancelled" },
  });
  await releaseTicketCapacity(ticket.ticketTypeId);
  await releaseShowtimeCapacity(ticket.showtimeId);
  if (ticket.seatId) {
    await prisma.$executeRaw`
      UPDATE CinemaSeat
      SET status = 'available', holdSessionId = NULL
      WHERE id = ${ticket.seatId}
    `;
  }

  const waiting = await prisma.cinemaWaitlist.findFirst({
    where: { showtimeId: ticket.showtimeId, status: "waiting" },
    orderBy: { createdAt: "asc" },
  });
  if (waiting) {
    await prisma.cinemaWaitlist.update({
      where: { id: waiting.id },
      data: { status: "promoted", promotedAt: new Date() },
    });
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: waiting.customerId,
      title: "Waitlist promotion",
      body: "A seat is now available for a showtime on your waitlist.",
      metadata: { showtimeId: ticket.showtimeId, waitlistId: waiting.id },
    });
  }

  const showtime = await prisma.cinemaShowtime.findUnique({
    where: { id: ticket.showtimeId },
  });
  if (showtime?.status === "sold_out" && showtime.soldCount < showtime.capacity) {
    await prisma.cinemaShowtime.update({
      where: { id: showtime.id },
      data: { status: "on_sale" },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_ticket.cancelled",
    resource: "cinema_ticket",
    resourceId: ticket.id,
  });

  return prisma.cinemaTicket.findUniqueOrThrow({ where: { id: ticket.id } });
}

export async function checkInCinemaAttendee(opts: {
  tenantId: string;
  ticketId: string;
  staffId?: string | null;
  source?: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const ticket = await prisma.cinemaTicket.findFirst({
    where: { id: opts.ticketId, tenantId: opts.tenantId },
    include: { attendee: true, showtime: { include: { content: true } } },
  });
  if (!ticket) throw httpError("Ticket not found", "not_found", 404);
  if (ticket.status === "cancelled") {
    throw httpError("Ticket cancelled", "ticket_cancelled", 409);
  }
  if (!ticket.attendee) throw httpError("Attendee not found", "not_found", 404);
  if (ticket.attendee.checkInStatus === "checked_in") {
    throw httpError("Already checked in", "already_checked_in", 409);
  }

  await prisma.cinemaAttendee.update({
    where: { id: ticket.attendee.id },
    data: { checkInStatus: "checked_in" },
  });
  await prisma.cinemaTicket.update({
    where: { id: ticket.id },
    data: { status: "used" },
  });

  const checkIn = await prisma.cinemaCheckIn.create({
    data: {
      tenantId: opts.tenantId,
      showtimeId: ticket.showtimeId,
      ticketId: ticket.id,
      attendeeId: ticket.attendee.id,
      status: "checked_in",
      staffId: opts.staffId ?? null,
      source: opts.source ?? "staff",
      metadata: {},
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_checkin.created",
    resource: "cinema_check_in",
    resourceId: checkIn.id,
  });

  if (ticket.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: ticket.customerId,
      title: "Check-in confirmation",
      body: `Checked in for ${ticket.showtime.content.title}.`,
      metadata: { ticketId: ticket.id, checkInId: checkIn.id },
    });
  }

  return checkIn;
}

export async function createConcession(opts: {
  tenantId: string;
  venueId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  category?: string;
  price?: number;
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "product",
    name: opts.name,
    code: `CON-${opts.code}-${Date.now().toString(36)}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "cinema",
    sku: opts.code,
    unit: "item",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const concession = await prisma.cinemaConcession.create({
    data: {
      tenantId: opts.tenantId,
      venueId: opts.venueId ?? null,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      category: opts.category ?? "snack",
      price: opts.price ?? 0,
      variants: [],
      modifiers: [],
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_concession.created",
    resource: "cinema_concession",
    resourceId: concession.id,
    metadata: { offeringId: offering.id },
  });

  return concession;
}

export async function createConcessionOrder(opts: {
  tenantId: string;
  venueId?: string | null;
  customerId?: string | null;
  items: Array<{ concessionId: string; quantity: number; notes?: string | null }>;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  if (!opts.items.length) throw httpError("Order requires items", "empty_order", 400);

  const lines = [];
  let total = 0;
  for (const item of opts.items) {
    const concession = await prisma.cinemaConcession.findFirst({
      where: { id: item.concessionId, tenantId: opts.tenantId, status: "active" },
    });
    if (!concession) throw httpError("Concession not found", "not_found", 404);
    const qty = Math.max(1, item.quantity);
    total += concession.price * qty;
    lines.push({
      tenantId: opts.tenantId,
      concessionId: concession.id,
      quantity: qty,
      unitPrice: concession.price,
      modifiers: [],
      notes: item.notes ?? null,
    });
  }

  const order = await prisma.cinemaConcessionOrder.create({
    data: {
      tenantId: opts.tenantId,
      venueId: opts.venueId ?? null,
      customerId: opts.customerId ?? null,
      status: "submitted",
      notes: opts.notes ?? null,
      totalAmount: total,
      submittedAt: new Date(),
      items: { create: lines },
    },
    include: { items: { include: { concession: true } } },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_concession_order.created",
    resource: "cinema_concession_order",
    resourceId: order.id,
  });

  return order;
}

export async function updateConcessionOrderStatus(opts: {
  tenantId: string;
  orderId: string;
  status: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const order = await prisma.cinemaConcessionOrder.findFirst({
    where: { id: opts.orderId, tenantId: opts.tenantId },
  });
  if (!order) throw httpError("Order not found", "not_found", 404);

  const data: {
    status: string;
    readyAt?: Date;
    collectedAt?: Date;
  } = { status: opts.status };
  if (opts.status === "ready") data.readyAt = new Date();
  if (opts.status === "collected") data.collectedAt = new Date();

  const updated = await prisma.cinemaConcessionOrder.update({
    where: { id: order.id },
    data,
  });

  if (opts.status === "ready" && order.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: order.customerId,
      title: "Concession order ready",
      body: "Your concession order is ready for collection.",
      metadata: { orderId: order.id },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "cinema_concession_order.status",
    resource: "cinema_concession_order",
    resourceId: order.id,
    metadata: { status: opts.status },
  });

  return updated;
}
