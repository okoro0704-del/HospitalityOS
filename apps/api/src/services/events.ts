import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import {
  createBooking,
  ensureDefaultCategories,
} from "./booking-engine.js";
import { createOffering, ensureDefaultCatalog } from "./commerce-engine.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function ensureEventsCategory(tenantId: string) {
  await ensureDefaultCategories(tenantId);
  return prisma.resourceCategory.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "events" } },
  });
}

export async function ensureVenueResource(opts: { tenantId: string; venueId: string }) {
  const venue = await prisma.eventVenue.findFirst({
    where: { id: opts.venueId, tenantId: opts.tenantId },
  });
  if (!venue) throw httpError("Venue not found", "not_found", 404);
  if (venue.bookableResourceId) return venue.bookableResourceId;

  const category = await ensureEventsCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "venue_booking",
      name: `Venue: ${venue.name}`,
      code: `VEN-${venue.id.slice(-8)}`,
      capacity: venue.capacity,
      status: "available",
      tags: ["venue", venue.venueType],
      metadata: { venueId: venue.id },
      customFields: {},
      sourceType: "event_venue",
      sourceId: venue.id,
    },
  });
  await prisma.eventVenue.update({
    where: { id: venue.id },
    data: { bookableResourceId: resource.id },
  });
  return resource.id;
}

export async function ensureAreaResource(opts: { tenantId: string; areaId: string }) {
  const area = await prisma.venueArea.findFirst({
    where: { id: opts.areaId, tenantId: opts.tenantId },
  });
  if (!area) throw httpError("Venue area not found", "not_found", 404);
  if (area.bookableResourceId) return area.bookableResourceId;

  const category = await ensureEventsCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "venue_booking",
      name: `Area: ${area.name}`,
      code: `VAR-${area.id.slice(-8)}`,
      capacity: area.capacity,
      status: "available",
      tags: ["venue_area"],
      metadata: { areaId: area.id, venueId: area.venueId },
      customFields: {},
      sourceType: "venue_area",
      sourceId: area.id,
    },
  });
  await prisma.venueArea.update({
    where: { id: area.id },
    data: { bookableResourceId: resource.id },
  });
  return resource.id;
}

export async function createEventTicketType(opts: {
  tenantId: string;
  eventId: string;
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
  const event = await prisma.event.findFirst({
    where: { id: opts.eventId, tenantId: opts.tenantId },
  });
  if (!event) throw httpError("Event not found", "not_found", 404);

  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "product",
    name: `${event.name} — ${opts.name}`,
    code: `TKT-${opts.code}-${Date.now().toString(36)}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "ticketing",
    sku: opts.code,
    unit: "ticket",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const ticketType = await prisma.eventTicketType.create({
    data: {
      tenantId: opts.tenantId,
      eventId: event.id,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      price: opts.price ?? 0,
      capacity: opts.capacity ?? event.capacity,
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
    action: "event_ticket_type.created",
    resource: "event_ticket_type",
    resourceId: ticketType.id,
    metadata: { offeringId: offering.id },
  });

  return ticketType;
}

/**
 * Atomic capacity claim for ticket types (SQLite-safe).
 * Returns false if sold out / race lost.
 */
async function claimTicketCapacity(ticketTypeId: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE EventTicketType
    SET soldCount = soldCount + 1, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${ticketTypeId}
      AND status = 'active'
      AND soldCount < capacity
  `;
  return Number(result) === 1;
}

async function releaseTicketCapacity(ticketTypeId: string) {
  await prisma.$executeRaw`
    UPDATE EventTicketType
    SET soldCount = CASE WHEN soldCount > 0 THEN soldCount - 1 ELSE 0 END,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${ticketTypeId}
  `;
}

async function claimEventCapacity(eventId: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE Event
    SET soldCount = soldCount + 1, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${eventId}
      AND soldCount < capacity
      AND status IN ('published', 'open', 'sold_out')
  `;
  return Number(result) === 1;
}

async function releaseEventCapacity(eventId: string) {
  await prisma.$executeRaw`
    UPDATE Event
    SET soldCount = CASE WHEN soldCount > 0 THEN soldCount - 1 ELSE 0 END,
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${eventId}
  `;
}

/** Claim a seat only if still available (prevents concurrent seat races). */
async function claimSeat(seatId: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE Seat
    SET status = 'sold'
    WHERE id = ${seatId} AND status = 'available'
  `;
  return Number(result) === 1;
}

async function maybeMarkSoldOut(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return;
  if (event.soldCount >= event.capacity && ["published", "open"].includes(event.status)) {
    await prisma.event.update({
      where: { id: eventId },
      data: { status: "sold_out" },
    });
  }
}

export async function bookEventTicket(opts: {
  tenantId: string;
  eventId: string;
  ticketTypeId: string;
  customerId?: string | null;
  seatId?: string | null;
  holderName?: string | null;
  holderEmail?: string | null;
  joinWaitlistIfUnavailable?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  const event = await prisma.event.findFirst({
    where: { id: opts.eventId, tenantId: opts.tenantId },
  });
  if (!event) throw httpError("Event not found", "not_found", 404);
  if (!["published", "open", "sold_out"].includes(event.status)) {
    throw httpError("Event is not open for ticket sales", "event_closed", 409);
  }

  const ticketType = await prisma.eventTicketType.findFirst({
    where: {
      id: opts.ticketTypeId,
      eventId: event.id,
      tenantId: opts.tenantId,
      status: "active",
    },
  });
  if (!ticketType) throw httpError("Ticket type not found", "not_found", 404);

  const now = new Date();
  if (ticketType.salesStart && now < ticketType.salesStart) {
    throw httpError("Sales have not started", "sales_not_started", 409);
  }
  if (ticketType.salesEnd && now > ticketType.salesEnd) {
    throw httpError("Sales have ended", "sales_ended", 409);
  }

  if (event.seatingMode === "assigned" && !opts.seatId) {
    throw httpError("Seat required for assigned seating", "seat_required", 400);
  }
  if (event.seatingMode === "general_admission" && opts.seatId) {
    throw httpError("Seats not used in general admission", "seat_not_allowed", 400);
  }

  const claimedType = await claimTicketCapacity(ticketType.id);
  if (!claimedType) {
    if (opts.joinWaitlistIfUnavailable && opts.customerId) {
      const entry = await prisma.eventWaitlist.create({
        data: {
          tenantId: opts.tenantId,
          eventId: event.id,
          ticketTypeId: ticketType.id,
          customerId: opts.customerId,
          status: "waiting",
        },
      });
      throw Object.assign(new Error("Joined waitlist — ticket type sold out"), {
        code: "waitlisted",
        statusCode: 409,
        waitlistEntry: entry,
      });
    }
    throw httpError("Ticket type sold out", "sold_out", 409);
  }

  const claimedEvent = await claimEventCapacity(event.id);
  if (!claimedEvent) {
    await releaseTicketCapacity(ticketType.id);
    if (opts.joinWaitlistIfUnavailable && opts.customerId) {
      const entry = await prisma.eventWaitlist.create({
        data: {
          tenantId: opts.tenantId,
          eventId: event.id,
          ticketTypeId: ticketType.id,
          customerId: opts.customerId,
          status: "waiting",
        },
      });
      throw Object.assign(new Error("Joined waitlist — event at capacity"), {
        code: "waitlisted",
        statusCode: 409,
        waitlistEntry: entry,
      });
    }
    throw httpError("Event sold out", "sold_out", 409);
  }

  let seatId: string | null = null;
  if (opts.seatId) {
    const seat = await prisma.seat.findFirst({
      where: { id: opts.seatId, tenantId: opts.tenantId },
      include: { section: { include: { plan: true } } },
    });
    if (!seat || seat.section.plan.eventId !== event.id) {
      await releaseTicketCapacity(ticketType.id);
      await releaseEventCapacity(event.id);
      throw httpError("Seat not found for this event", "not_found", 404);
    }
    const claimedSeat = await claimSeat(seat.id);
    if (!claimedSeat) {
      await releaseTicketCapacity(ticketType.id);
      await releaseEventCapacity(event.id);
      throw httpError("Seat already taken", "seat_taken", 409);
    }
    seatId = seat.id;
  }

  try {
    const ticket = await prisma.eventTicket.create({
      data: {
        tenantId: opts.tenantId,
        eventId: event.id,
        ticketTypeId: ticketType.id,
        customerId: opts.customerId ?? null,
        seatId,
        status: "confirmed",
        holderName: opts.holderName ?? null,
        holderEmail: opts.holderEmail ?? null,
        metadata: {},
        attendee: {
          create: {
            tenantId: opts.tenantId,
            eventId: event.id,
            customerId: opts.customerId ?? null,
            displayName: opts.holderName ?? "Guest",
            email: opts.holderEmail ?? null,
            checkInStatus: "not_checked_in",
            status: "registered",
          },
        },
      },
      include: { attendee: true, ticketType: true, seat: true },
    });

    await maybeMarkSoldOut(event.id);

    if (opts.customerId) {
      await createNotification({
        tenantId: opts.tenantId,
        actorKind: "guest",
        actorId: opts.customerId,
        title: "Ticket booked",
        body: `Your ticket for ${event.name} is confirmed.`,
        metadata: { ticketId: ticket.id, eventId: event.id },
      });
    }

    await writeAudit({
      tenantId: opts.tenantId,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
      action: "event_ticket.booked",
      resource: "event_ticket",
      resourceId: ticket.id,
      metadata: { eventId: event.id, ticketTypeId: ticketType.id, seatId },
    });

    return ticket;
  } catch (err) {
    await releaseTicketCapacity(ticketType.id);
    await releaseEventCapacity(event.id);
    if (seatId) {
      await prisma.$executeRaw`
        UPDATE Seat SET status = 'available' WHERE id = ${seatId} AND status = 'sold'
      `;
    }
    throw err;
  }
}

export async function cancelEventTicket(opts: {
  tenantId: string;
  ticketId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const ticket = await prisma.eventTicket.findFirst({
    where: { id: opts.ticketId, tenantId: opts.tenantId },
  });
  if (!ticket) throw httpError("Ticket not found", "not_found", 404);
  if (ticket.status === "cancelled") return ticket;

  await prisma.eventTicket.update({
    where: { id: ticket.id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  await prisma.eventAttendee.updateMany({
    where: { ticketId: ticket.id },
    data: { status: "cancelled", checkInStatus: "cancelled" },
  });
  await releaseTicketCapacity(ticket.ticketTypeId);
  await releaseEventCapacity(ticket.eventId);
  if (ticket.seatId) {
    await prisma.$executeRaw`
      UPDATE Seat SET status = 'available' WHERE id = ${ticket.seatId}
    `;
  }

  const waiting = await prisma.eventWaitlist.findFirst({
    where: { eventId: ticket.eventId, status: "waiting" },
    orderBy: { createdAt: "asc" },
  });
  if (waiting) {
    await prisma.eventWaitlist.update({
      where: { id: waiting.id },
      data: { status: "promoted", promotedAt: new Date() },
    });
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: waiting.customerId,
      title: "Waitlist promotion",
      body: "A ticket is now available for an event on your waitlist.",
      metadata: { eventId: ticket.eventId, waitlistId: waiting.id },
    });
  }

  const event = await prisma.event.findUnique({ where: { id: ticket.eventId } });
  if (event?.status === "sold_out" && event.soldCount < event.capacity) {
    await prisma.event.update({
      where: { id: event.id },
      data: { status: "open" },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "event_ticket.cancelled",
    resource: "event_ticket",
    resourceId: ticket.id,
  });

  return prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });
}

export async function bookVenueRental(opts: {
  tenantId: string;
  venueId: string;
  areaId?: string | null;
  customerId?: string | null;
  startsAt: Date;
  endsAt: Date;
  partySize?: number;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const venue = await prisma.eventVenue.findFirst({
    where: { id: opts.venueId, tenantId: opts.tenantId, status: "active" },
  });
  if (!venue) throw httpError("Venue not found", "not_found", 404);

  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "service",
    name: `Venue rental: ${venue.name}`,
    code: `VR-${Date.now().toString(36)}`,
    basePrice: 0,
    status: "active",
    visibility: "public",
    moduleId: "venue_booking",
    durationMinutes: Math.round((opts.endsAt.getTime() - opts.startsAt.getTime()) / 60000),
    bookable: true,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  }).catch(() => null);

  const items: Array<{ resourceId: string; quantity: number }> = [];
  if (opts.areaId) {
    items.push({
      resourceId: await ensureAreaResource({ tenantId: opts.tenantId, areaId: opts.areaId }),
      quantity: 1,
    });
  } else {
    items.push({
      resourceId: await ensureVenueResource({ tenantId: opts.tenantId, venueId: venue.id }),
      quantity: 1,
    });
  }

  const booking = await createBooking({
    tenantId: opts.tenantId,
    moduleId: "venue_booking",
    customerId: opts.customerId,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    partySize: opts.partySize ?? 1,
    notes: opts.notes,
    status: "confirmed",
    items,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const rental = await prisma.venueBooking.create({
    data: {
      tenantId: opts.tenantId,
      venueId: venue.id,
      areaId: opts.areaId ?? null,
      customerId: opts.customerId ?? null,
      bookingId: booking.id,
      offeringId: offering?.id ?? null,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      partySize: opts.partySize ?? 1,
      notes: opts.notes ?? null,
      status: "confirmed",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "venue_booking.created",
    resource: "venue_booking",
    resourceId: rental.id,
    metadata: { bookingId: booking.id },
  });

  return { rental, booking };
}

export async function createEventSession(opts: {
  tenantId: string;
  eventId: string;
  name: string;
  code: string;
  startsAt: Date;
  endsAt: Date;
  venueId?: string | null;
  areaId?: string | null;
  capacity?: number;
  speakers?: unknown[];
  actorKind: string;
  actorId?: string | null;
}) {
  const event = await prisma.event.findFirst({
    where: { id: opts.eventId, tenantId: opts.tenantId },
  });
  if (!event) throw httpError("Event not found", "not_found", 404);

  const category = await ensureEventsCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "events",
      name: `${event.name}: ${opts.name}`,
      code: `ESS-${opts.code}-${Date.now().toString(36)}`,
      capacity: opts.capacity ?? event.capacity,
      status: "available",
      tags: ["event_session"],
      metadata: { eventId: event.id },
      customFields: {},
      sourceType: "event_session",
      sourceId: `pending`,
    },
  });

  const session = await prisma.eventSession.create({
    data: {
      tenantId: opts.tenantId,
      eventId: event.id,
      venueId: opts.venueId ?? event.venueId,
      areaId: opts.areaId ?? null,
      name: opts.name,
      code: opts.code,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      capacity: opts.capacity ?? event.capacity,
      speakers: (opts.speakers ?? []) as Prisma.InputJsonValue,
      status: "scheduled",
      bookableResourceId: resource.id,
    },
  });

  await prisma.bookableResource.update({
    where: { id: resource.id },
    data: { sourceId: session.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "event_session.created",
    resource: "event_session",
    resourceId: session.id,
  });

  return session;
}

export async function publishEvent(opts: {
  tenantId: string;
  eventId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const event = await prisma.event.findFirst({
    where: { id: opts.eventId, tenantId: opts.tenantId },
  });
  if (!event) throw httpError("Event not found", "not_found", 404);

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      status: "open",
      publishedAt: new Date(),
    },
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "system",
    title: "Event published",
    body: `${event.name} is now open for tickets.`,
    metadata: { eventId: event.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "event.published",
    resource: "event",
    resourceId: event.id,
  });

  return updated;
}

export async function checkInAttendee(opts: {
  tenantId: string;
  ticketId: string;
  staffId?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const ticket = await prisma.eventTicket.findFirst({
    where: { id: opts.ticketId, tenantId: opts.tenantId },
    include: { attendee: true, event: true },
  });
  if (!ticket) throw httpError("Ticket not found", "not_found", 404);
  if (ticket.status === "cancelled") {
    throw httpError("Ticket cancelled", "ticket_cancelled", 409);
  }

  if (ticket.attendee) {
    await prisma.eventAttendee.update({
      where: { id: ticket.attendee.id },
      data: { checkInStatus: "checked_in" },
    });
  }

  const checkIn = await prisma.eventCheckIn.create({
    data: {
      tenantId: opts.tenantId,
      eventId: ticket.eventId,
      ticketId: ticket.id,
      attendeeId: ticket.attendee?.id ?? null,
      status: "checked_in",
      staffId: opts.staffId ?? null,
      source: opts.actorKind,
      metadata: {},
    },
  });

  await prisma.eventTicket.update({
    where: { id: ticket.id },
    data: { status: "used" },
  });

  if (ticket.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: ticket.customerId,
      title: "Check-in confirmation",
      body: `Checked in for ${ticket.event.name}.`,
      metadata: { checkInId: checkIn.id },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "event_checkin.created",
    resource: "event_checkin",
    resourceId: checkIn.id,
  });

  return checkIn;
}

export async function createEventPackage(opts: {
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  price?: number;
  eventId?: string | null;
  items?: unknown[];
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "package",
    name: opts.name,
    code: `EPKG-${opts.code}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    bundlePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "events",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  return prisma.eventPackage.create({
    data: {
      tenantId: opts.tenantId,
      eventId: opts.eventId ?? null,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      price: opts.price ?? 0,
      items: (opts.items ?? []) as object,
      status: "active",
    },
  });
}

export async function createEventAddon(opts: {
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  price?: number;
  eventId?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "product",
    name: opts.name,
    code: `EADD-${opts.code}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "events",
    sku: opts.code,
    unit: "addon",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  return prisma.eventAddon.create({
    data: {
      tenantId: opts.tenantId,
      eventId: opts.eventId ?? null,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      price: opts.price ?? 0,
      status: "active",
    },
  });
}
