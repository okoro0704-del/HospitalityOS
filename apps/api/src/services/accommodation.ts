import type { Prisma } from "@prisma/client";
import {
  BLOCKING_MAINTENANCE_STATUSES,
  BLOCKING_RESERVATION_STATUSES,
  type CalendarView,
  type HousekeepingStatus,
  type MaintenanceStatus,
  type ReservationStatus,
} from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import {
  cancelBooking,
  createBooking,
  syncRoomToBookableResource,
  transitionBooking,
  updateBooking,
} from "./booking-engine.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function confirmationCode() {
  return `HOS-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

async function addTimeline(opts: {
  tenantId: string;
  reservationId: string;
  eventType: string;
  message: string;
  actorKind: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.reservationTimeline.create({
    data: {
      tenantId: opts.tenantId,
      reservationId: opts.reservationId,
      eventType: opts.eventType,
      message: opts.message,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function datesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  // [start, end) nights — checkout day is available for new check-in
  return aStart < bEnd && bStart < aEnd;
}

export async function findConflictingReservations(opts: {
  tenantId: string;
  roomTypeId: string;
  roomId?: string | null;
  checkInDate: Date;
  checkOutDate: Date;
  excludeReservationId?: string;
}) {
  const rows = await prisma.accommodationReservation.findMany({
    where: {
      tenantId: opts.tenantId,
      roomTypeId: opts.roomTypeId,
      status: { in: [...BLOCKING_RESERVATION_STATUSES] },
      ...(opts.excludeReservationId
        ? { id: { not: opts.excludeReservationId } }
        : {}),
      ...(opts.roomId ? { roomId: opts.roomId } : {}),
    },
  });
  return rows.filter((r) =>
    datesOverlap(opts.checkInDate, opts.checkOutDate, r.checkInDate, r.checkOutDate),
  );
}

export async function assertRoomReservable(opts: {
  tenantId: string;
  roomId: string;
  checkInDate: Date;
  checkOutDate: Date;
  excludeReservationId?: string;
}) {
  const room = await prisma.room.findFirst({
    where: { id: opts.roomId, tenantId: opts.tenantId, status: "active" },
  });
  if (!room) throw httpError("Room not found", "not_found", 404);

  if (
    BLOCKING_MAINTENANCE_STATUSES.includes(
      room.maintenanceStatus as MaintenanceStatus,
    )
  ) {
    throw httpError(
      "Room is under maintenance or blocked and cannot be reserved",
      "room_not_reservable",
      409,
    );
  }
  if (room.housekeepingStatus === "out_of_service") {
    throw httpError("Room is out of service", "room_not_reservable", 409);
  }

  const conflicts = await findConflictingReservations({
    tenantId: opts.tenantId,
    roomTypeId: room.roomTypeId,
    roomId: room.id,
    checkInDate: opts.checkInDate,
    checkOutDate: opts.checkOutDate,
    excludeReservationId: opts.excludeReservationId,
  });
  if (conflicts.length) {
    throw httpError("Room is not available for those dates", "room_unavailable", 409);
  }
  return room;
}

export async function getAvailableRooms(opts: {
  tenantId: string;
  propertyId?: string;
  roomTypeId: string;
  checkInDate: Date;
  checkOutDate: Date;
}) {
  const rooms = await prisma.room.findMany({
    where: {
      tenantId: opts.tenantId,
      roomTypeId: opts.roomTypeId,
      status: "active",
      ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
      maintenanceStatus: { notIn: [...BLOCKING_MAINTENANCE_STATUSES] },
      housekeepingStatus: { not: "out_of_service" },
    },
  });

  const available = [];
  for (const room of rooms) {
    const conflicts = await findConflictingReservations({
      tenantId: opts.tenantId,
      roomTypeId: opts.roomTypeId,
      roomId: room.id,
      checkInDate: opts.checkInDate,
      checkOutDate: opts.checkOutDate,
    });
    if (!conflicts.length) available.push(room);
  }
  return available;
}

export async function createReservation(opts: {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  roomId?: string | null;
  customerId: string;
  checkInDate: Date;
  checkOutDate: Date;
  adults?: number;
  children?: number;
  status?: ReservationStatus;
  internalNotes?: string | null;
  guestNotes?: string | null;
  guestName?: string;
  guestEmail?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  if (opts.checkOutDate <= opts.checkInDate) {
    throw httpError("Check-out must be after check-in", "validation_error", 400);
  }

  const property = await prisma.property.findFirst({
    where: { id: opts.propertyId, tenantId: opts.tenantId, status: "active" },
  });
  if (!property) throw httpError("Property not found", "not_found", 404);

  const roomType = await prisma.roomType.findFirst({
    where: {
      id: opts.roomTypeId,
      tenantId: opts.tenantId,
      propertyId: opts.propertyId,
      status: "active",
    },
  });
  if (!roomType) throw httpError("Room type not found", "not_found", 404);

  const customer = await prisma.customer.findFirst({
    where: { id: opts.customerId, tenantId: opts.tenantId },
  });
  if (!customer) throw httpError("Guest profile not found", "not_found", 404);

  let roomId = opts.roomId ?? null;
  if (roomId) {
    await assertRoomReservable({
      tenantId: opts.tenantId,
      roomId,
      checkInDate: opts.checkInDate,
      checkOutDate: opts.checkOutDate,
    });
  } else {
    const available = await getAvailableRooms({
      tenantId: opts.tenantId,
      propertyId: opts.propertyId,
      roomTypeId: opts.roomTypeId,
      checkInDate: opts.checkInDate,
      checkOutDate: opts.checkOutDate,
    });
    if (!available.length) {
      throw httpError(
        "No rooms available for the selected dates",
        "room_unavailable",
        409,
      );
    }
  }

  const status = opts.status ?? "confirmed";

  // Universal booking engine — sync room (or first available) as bookable resource
  let engineRoomId = roomId;
  if (!engineRoomId && status !== "draft") {
    const available = await getAvailableRooms({
      tenantId: opts.tenantId,
      propertyId: opts.propertyId,
      roomTypeId: opts.roomTypeId,
      checkInDate: opts.checkInDate,
      checkOutDate: opts.checkOutDate,
    });
    engineRoomId = available[0]?.id ?? null;
  }

  let bookingId: string | null = null;
  if (engineRoomId && status !== "draft") {
    const resource = await syncRoomToBookableResource({
      tenantId: opts.tenantId,
      roomId: engineRoomId,
      roomNumber: (
        await prisma.room.findUniqueOrThrow({ where: { id: engineRoomId } })
      ).number,
      propertyCode: property.code,
      capacity: 1,
    });
    const booking = await createBooking({
      tenantId: opts.tenantId,
      moduleId: "accommodation",
      customerId: opts.customerId,
      startsAt: startOfDay(opts.checkInDate),
      endsAt: startOfDay(opts.checkOutDate),
      partySize: (opts.adults ?? 1) + (opts.children ?? 0),
      notes: opts.guestNotes ?? null,
      internalNotes: opts.internalNotes ?? null,
      status: status === "pending" ? "pending" : "confirmed",
      items: [{ resourceId: resource.id, quantity: 1 }],
      actorKind: opts.actorKind,
      actorId: opts.actorId,
      skipPolicy: true, // overnight stays use accommodation duration rules
    });
    bookingId = booking.id;
    if (!roomId) roomId = engineRoomId;
  }

  const reservation = await prisma.accommodationReservation.create({
    data: {
      tenantId: opts.tenantId,
      propertyId: opts.propertyId,
      roomTypeId: opts.roomTypeId,
      roomId,
      customerId: opts.customerId,
      bookingId,
      status,
      checkInDate: startOfDay(opts.checkInDate),
      checkOutDate: startOfDay(opts.checkOutDate),
      adults: opts.adults ?? 1,
      children: opts.children ?? 0,
      confirmationCode: confirmationCode(),
      internalNotes: opts.internalNotes ?? null,
      guestNotes: opts.guestNotes ?? null,
      guests: {
        create: [
          {
            tenantId: opts.tenantId,
            fullName: opts.guestName ?? customer.displayName,
            email: opts.guestEmail ?? customer.email,
            isPrimary: true,
          },
        ],
      },
    },
    include: { guests: true, roomType: true, property: true, customer: true },
  });

  if (roomId && status !== "draft") {
    await prisma.room.update({
      where: { id: roomId },
      data: { occupancyStatus: "reserved" },
    });
  }

  await addTimeline({
    tenantId: opts.tenantId,
    reservationId: reservation.id,
    eventType: "reservation.created",
    message: `Reservation ${reservation.confirmationCode} created (${status})`,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    metadata: bookingId ? { bookingId } : {},
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "reservation.created",
    resource: "reservation",
    resourceId: reservation.id,
    metadata: { confirmationCode: reservation.confirmationCode, status, bookingId },
  });

  if (status === "confirmed" || status === "pending") {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: opts.customerId,
      title: "Reservation confirmed",
      body: `Your stay ${reservation.confirmationCode} is ${status}.`,
      metadata: { reservationId: reservation.id, bookingId },
    });
  }

  return reservation;
}

export async function updateReservation(opts: {
  tenantId: string;
  reservationId: string;
  checkInDate?: Date;
  checkOutDate?: Date;
  adults?: number;
  children?: number;
  roomId?: string | null;
  internalNotes?: string | null;
  guestNotes?: string | null;
  status?: ReservationStatus;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.accommodationReservation.findFirst({
    where: { id: opts.reservationId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (["checked_out", "cancelled", "no_show"].includes(existing.status)) {
    throw httpError("Reservation can no longer be modified", "invalid_state", 409);
  }

  const checkInDate = opts.checkInDate
    ? startOfDay(opts.checkInDate)
    : existing.checkInDate;
  const checkOutDate = opts.checkOutDate
    ? startOfDay(opts.checkOutDate)
    : existing.checkOutDate;
  if (checkOutDate <= checkInDate) {
    throw httpError("Check-out must be after check-in", "validation_error", 400);
  }

  const roomId = opts.roomId !== undefined ? opts.roomId : existing.roomId;
  if (roomId) {
    await assertRoomReservable({
      tenantId: opts.tenantId,
      roomId,
      checkInDate,
      checkOutDate,
      excludeReservationId: existing.id,
    });
  } else {
    const conflicts = await findConflictingReservations({
      tenantId: opts.tenantId,
      roomTypeId: existing.roomTypeId,
      checkInDate,
      checkOutDate,
      excludeReservationId: existing.id,
    });
    // At room-type level, ensure at least one free room remains conceptually —
    // for sprint 2 we allow pending without assigned room if inventory exists.
    const available = await getAvailableRooms({
      tenantId: opts.tenantId,
      propertyId: existing.propertyId,
      roomTypeId: existing.roomTypeId,
      checkInDate,
      checkOutDate,
    });
    // conflicts for unassigned are checked via available rooms count vs blocking unassigned
    const unassignedBlocking = conflicts.filter((c) => !c.roomId);
    if (available.length === 0 && unassignedBlocking.length >= 0 && available.length === 0) {
      // If no physical rooms free, reject
      throw httpError("No availability for updated dates", "room_unavailable", 409);
    }
  }

  const updated = await prisma.accommodationReservation.update({
    where: { id: existing.id },
    data: {
      checkInDate,
      checkOutDate,
      adults: opts.adults ?? existing.adults,
      children: opts.children ?? existing.children,
      roomId,
      internalNotes:
        opts.internalNotes !== undefined ? opts.internalNotes : existing.internalNotes,
      guestNotes: opts.guestNotes !== undefined ? opts.guestNotes : existing.guestNotes,
      status: opts.status ?? existing.status,
    },
    include: { guests: true, roomType: true, property: true, customer: true },
  });

  if (existing.bookingId) {
    await updateBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      startsAt: checkInDate,
      endsAt: checkOutDate,
      partySize: (opts.adults ?? existing.adults) + (opts.children ?? existing.children),
      notes: opts.guestNotes !== undefined ? opts.guestNotes : existing.guestNotes,
      internalNotes:
        opts.internalNotes !== undefined ? opts.internalNotes : existing.internalNotes,
      status: (opts.status as "pending" | "confirmed" | undefined) ?? undefined,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  await addTimeline({
    tenantId: opts.tenantId,
    reservationId: updated.id,
    eventType: "reservation.updated",
    message: "Reservation updated",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "reservation.modified",
    resource: "reservation",
    resourceId: updated.id,
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: updated.customerId,
    title: "Reservation updated",
    body: `Your reservation ${updated.confirmationCode} was updated.`,
    metadata: { reservationId: updated.id },
  });

  return updated;
}

export async function cancelReservation(opts: {
  tenantId: string;
  reservationId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.accommodationReservation.findFirst({
    where: { id: opts.reservationId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (["checked_out", "cancelled", "checked_in"].includes(existing.status)) {
    throw httpError(
      existing.status === "checked_in"
        ? "Checked-in stays must be checked out, not cancelled"
        : "Reservation cannot be cancelled",
      "invalid_state",
      409,
    );
  }

  const updated = await prisma.accommodationReservation.update({
    where: { id: existing.id },
    data: { status: "cancelled", cancelledAt: new Date() },
    include: { guests: true, roomType: true, property: true, customer: true },
  });

  if (existing.bookingId) {
    await cancelBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  if (existing.roomId) {
    await prisma.room.update({
      where: { id: existing.roomId },
      data: { occupancyStatus: "vacant" },
    });
  }

  await addTimeline({
    tenantId: opts.tenantId,
    reservationId: updated.id,
    eventType: "reservation.cancelled",
    message: "Reservation cancelled",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "reservation.cancelled",
    resource: "reservation",
    resourceId: updated.id,
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: updated.customerId,
    title: "Reservation cancelled",
    body: `Reservation ${updated.confirmationCode} was cancelled.`,
    metadata: { reservationId: updated.id },
  });

  return updated;
}

export async function checkInReservation(opts: {
  tenantId: string;
  reservationId: string;
  roomId?: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.accommodationReservation.findFirst({
    where: { id: opts.reservationId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (!["confirmed", "pending"].includes(existing.status)) {
    throw httpError("Only confirmed/pending reservations can check in", "invalid_state", 409);
  }

  const roomId = opts.roomId ?? existing.roomId;
  if (!roomId) throw httpError("A room must be assigned for check-in", "room_required", 400);

  await assertRoomReservable({
    tenantId: opts.tenantId,
    roomId,
    checkInDate: existing.checkInDate,
    checkOutDate: existing.checkOutDate,
    excludeReservationId: existing.id,
  });

  const now = new Date();
  const [reservation] = await prisma.$transaction([
    prisma.accommodationReservation.update({
      where: { id: existing.id },
      data: {
        status: "checked_in",
        roomId,
        checkedInAt: now,
      },
      include: { guests: true, roomType: true, property: true, customer: true, stay: true },
    }),
    prisma.room.update({
      where: { id: roomId },
      data: { occupancyStatus: "occupied", housekeepingStatus: "dirty" },
    }),
    prisma.stay.create({
      data: {
        tenantId: opts.tenantId,
        reservationId: existing.id,
        propertyId: existing.propertyId,
        roomId,
        customerId: existing.customerId,
        startedAt: now,
        status: "active",
      },
    }),
  ]);

  if (existing.bookingId) {
    await transitionBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      status: "checked_in",
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  await addTimeline({
    tenantId: opts.tenantId,
    reservationId: existing.id,
    eventType: "check_in",
    message: `Checked in to room`,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    metadata: { roomId },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "reservation.check_in",
    resource: "reservation",
    resourceId: existing.id,
    metadata: { roomId },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "room.assigned",
    resource: "room",
    resourceId: roomId,
    metadata: { reservationId: existing.id },
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: existing.customerId,
    title: "Check-in complete",
    body: `Welcome — reservation ${existing.confirmationCode} is checked in.`,
    metadata: { reservationId: existing.id },
  });

  return reservation;
}

export async function checkOutReservation(opts: {
  tenantId: string;
  reservationId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.accommodationReservation.findFirst({
    where: { id: opts.reservationId, tenantId: opts.tenantId },
    include: { stay: true },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (existing.status !== "checked_in") {
    throw httpError("Only checked-in reservations can check out", "invalid_state", 409);
  }
  if (!existing.roomId) throw httpError("Reservation has no room", "invalid_state", 409);

  const now = new Date();
  const reservation = await prisma.accommodationReservation.update({
    where: { id: existing.id },
    data: { status: "checked_out", checkedOutAt: now },
    include: { guests: true, roomType: true, property: true, customer: true, stay: true },
  });

  await prisma.room.update({
    where: { id: existing.roomId },
    data: {
      occupancyStatus: "vacant",
      housekeepingStatus: "dirty",
    },
  });

  if (existing.stay) {
    await prisma.stay.update({
      where: { id: existing.stay.id },
      data: { endedAt: now, status: "completed" },
    });
  }

  if (existing.bookingId) {
    await transitionBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      status: "checked_out",
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  await addTimeline({
    tenantId: opts.tenantId,
    reservationId: existing.id,
    eventType: "check_out",
    message: "Checked out",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "reservation.check_out",
    resource: "reservation",
    resourceId: existing.id,
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    title: "Housekeeping assigned",
    body: `Room needs cleaning after checkout of ${existing.confirmationCode}.`,
    metadata: { roomId: existing.roomId, reservationId: existing.id },
  });

  return reservation;
}

export async function updateHousekeeping(opts: {
  tenantId: string;
  roomId: string;
  status: HousekeepingStatus;
  actorKind: string;
  actorId?: string | null;
}) {
  const room = await prisma.room.findFirst({
    where: { id: opts.roomId, tenantId: opts.tenantId },
  });
  if (!room) throw httpError("Room not found", "not_found", 404);

  const updated = await prisma.room.update({
    where: { id: room.id },
    data: { housekeepingStatus: opts.status },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "housekeeping.updated",
    resource: "room",
    resourceId: room.id,
    metadata: { status: opts.status },
  });

  if (opts.status === "in_progress" || opts.status === "dirty") {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "staff",
      actorId: opts.actorId,
      title: "Housekeeping assigned",
      body: `Room ${room.number} marked ${opts.status.replaceAll("_", " ")}.`,
      metadata: { roomId: room.id },
    });
  }

  return updated;
}

export async function updateMaintenance(opts: {
  tenantId: string;
  roomId: string;
  status: MaintenanceStatus;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const room = await prisma.room.findFirst({
    where: { id: opts.roomId, tenantId: opts.tenantId },
  });
  if (!room) throw httpError("Room not found", "not_found", 404);

  const updated = await prisma.room.update({
    where: { id: room.id },
    data: {
      maintenanceStatus: opts.status,
      ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
      ...(BLOCKING_MAINTENANCE_STATUSES.includes(opts.status)
        ? { occupancyStatus: room.occupancyStatus === "occupied" ? "occupied" : "vacant" }
        : {}),
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "maintenance.updated",
    resource: "room",
    resourceId: room.id,
    metadata: { status: opts.status },
  });

  if (opts.status === "scheduled" || opts.status === "under_maintenance") {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "staff",
      actorId: opts.actorId,
      title: "Maintenance scheduled",
      body: `Room ${room.number} set to ${opts.status.replaceAll("_", " ")}.`,
      metadata: { roomId: room.id },
    });
  }

  return updated;
}

export async function buildCalendar(opts: {
  tenantId: string;
  propertyId: string;
  view: CalendarView;
  anchorDate: Date;
}) {
  const anchor = startOfDay(opts.anchorDate);
  let rangeStart = anchor;
  let rangeEnd = addDays(anchor, 1);

  if (opts.view === "weekly") {
    const day = anchor.getUTCDay();
    rangeStart = addDays(anchor, -day);
    rangeEnd = addDays(rangeStart, 7);
  } else if (opts.view === "monthly") {
    rangeStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    rangeEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  }

  const rooms = await prisma.room.findMany({
    where: {
      tenantId: opts.tenantId,
      propertyId: opts.propertyId,
      status: "active",
    },
    include: { roomType: true },
    orderBy: { number: "asc" },
  });

  const reservations = await prisma.accommodationReservation.findMany({
    where: {
      tenantId: opts.tenantId,
      propertyId: opts.propertyId,
      status: { notIn: ["cancelled", "draft"] },
      checkInDate: { lt: rangeEnd },
      checkOutDate: { gt: rangeStart },
    },
    include: { customer: true, roomType: true },
  });

  const days: string[] = [];
  for (let d = new Date(rangeStart); d < rangeEnd; d = addDays(d, 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  return {
    view: opts.view,
    propertyId: opts.propertyId,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    days,
    rooms: rooms.map((r) => ({
      id: r.id,
      number: r.number,
      roomTypeId: r.roomTypeId,
      roomTypeName: r.roomType.name,
      occupancyStatus: r.occupancyStatus,
      housekeepingStatus: r.housekeepingStatus,
      maintenanceStatus: r.maintenanceStatus,
    })),
    reservations: reservations.map((res) => ({
      id: res.id,
      roomId: res.roomId,
      roomTypeId: res.roomTypeId,
      customerName: res.customer.displayName,
      status: res.status,
      checkInDate: res.checkInDate.toISOString().slice(0, 10),
      checkOutDate: res.checkOutDate.toISOString().slice(0, 10),
      confirmationCode: res.confirmationCode,
      isCheckIn: days.includes(res.checkInDate.toISOString().slice(0, 10)),
      isCheckOut: days.includes(res.checkOutDate.toISOString().slice(0, 10)),
    })),
  };
}

export { startOfDay, addDays };
