import type { Prisma } from "@prisma/client";
import {
  BLOCKING_MAINTENANCE_STATUSES,
  BLOCKING_RESERVATION_STATUSES,
  getMessagingProvider,
  type CalendarView,
  type HousekeepingStatus,
  type BookingStatus,
  type MaintenanceStatus,
  type ReservationStatus,
} from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { updateStayMirror, writeStayMirror } from "./booking-engine.js";
import { tryEnsureLifecycleInvoice } from "./billing/lifecycle.js";
import {
  claimRoomNights,
  inReservationTransaction,
  isIdempotencyKeyConflict,
  isRoomNightConflict,
  releaseRoomNights,
  reservationRequestHash,
} from "./room-allocation.js";

/** Domain messaging access — infrastructure only via IMessagingProvider. */
export { getMessagingProvider };

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

async function addTimeline(
  opts: {
    tenantId: string;
    reservationId: string;
    eventType: string;
    message: string;
    actorKind: string;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  },
  db: Prisma.TransactionClient = prisma,
) {
  await db.reservationTimeline.create({
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

/*
 * Reservation lifecycle.
 *
 * Every change that affects which room is held on which nights runs in one database
 * transaction together with the room-night ledger (services/room-allocation.ts), the
 * booking-engine mirror, the timeline and the audit entry. If any step fails — most
 * importantly a room-night that another reservation already holds — the whole change
 * rolls back and nothing partial remains. Status transitions are conditional updates,
 * so two concurrent changes to the same reservation cannot both apply. Notifications
 * and invoices leave the system, so they run only after the transaction has committed.
 */

const RESERVATION_INCLUDE = { guests: true, roomType: true, property: true, customer: true } as const;

/** Statuses a plain edit may set; check-in and check-out have their own flows. */
const EDITABLE_STATUSES: readonly string[] = ["draft", "pending", "confirmed", "cancelled", "no_show"];

function isBlocking(status: string) {
  return (BLOCKING_RESERVATION_STATUSES as readonly string[]).includes(status);
}

function roomUnavailable() {
  return httpError("Room is not available for those dates", "room_unavailable", 409);
}

function changedConcurrently() {
  return httpError("The reservation was changed by another request; reload and try again", "reservation_changed", 409);
}

function stayNightCount(checkInDate: Date, checkOutDate: Date) {
  return Math.max(1, Math.round((startOfDay(checkOutDate).getTime() - startOfDay(checkInDate).getTime()) / 86_400_000));
}

/** Side effects after commit must never undo or misreport the committed change. */
async function afterCommit(label: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (err) {
    console.warn(`[accommodation] ${label} failed after commit:`, err instanceof Error ? err.message : err);
  }
}

/** A room the reservation may hold: same tenant and property, active and not blocked. */
async function loadReservableRoom(
  db: Prisma.TransactionClient,
  opts: { tenantId: string; propertyId: string; roomId: string; roomTypeId?: string },
) {
  const room = await db.room.findFirst({
    where: { id: opts.roomId, tenantId: opts.tenantId, status: "active" },
  });
  if (!room) throw httpError("Room not found", "not_found", 404);
  if (room.propertyId !== opts.propertyId) {
    throw httpError("Room belongs to a different property", "room_mismatch", 400);
  }
  if (opts.roomTypeId && room.roomTypeId !== opts.roomTypeId) {
    throw httpError("Room is not of the reserved room type", "room_mismatch", 400);
  }
  if (BLOCKING_MAINTENANCE_STATUSES.includes(room.maintenanceStatus as MaintenanceStatus)) {
    throw httpError("Room is under maintenance or blocked and cannot be reserved", "room_not_reservable", 409);
  }
  if (room.housekeepingStatus === "out_of_service") {
    throw httpError("Room is out of service", "room_not_reservable", 409);
  }
  return room;
}

/**
 * Reservations made before the ledger existed hold no ledger rows (the PostgreSQL
 * migration backfills them; a pushed development database does not). An overlapping
 * one still blocks the room. No new reservation is ever written without its nights,
 * so this read cannot race.
 */
async function assertNoLedgerlessOverlap(
  db: Prisma.TransactionClient,
  opts: { tenantId: string; roomId: string; checkInDate: Date; checkOutDate: Date; excludeReservationId?: string },
) {
  const legacy = await db.accommodationReservation.findFirst({
    where: {
      tenantId: opts.tenantId,
      roomId: opts.roomId,
      status: { in: [...BLOCKING_RESERVATION_STATUSES] },
      checkInDate: { lt: opts.checkOutDate },
      checkOutDate: { gt: opts.checkInDate },
      nightAllocations: { none: {} },
      ...(opts.excludeReservationId ? { id: { not: opts.excludeReservationId } } : {}),
    },
    select: { id: true },
  });
  if (legacy) throw roomUnavailable();
}

/** Hold the stay's nights on `room` for the reservation (fails on any taken night). */
async function holdNights(
  db: Prisma.TransactionClient,
  opts: { tenantId: string; roomId: string; reservationId: string; checkInDate: Date; checkOutDate: Date },
) {
  await assertNoLedgerlessOverlap(db, { ...opts, excludeReservationId: opts.reservationId });
  await claimRoomNights(db, opts);
}

/** Free rooms of the type, starting at a random one so concurrent requests spread out. */
async function candidateRooms(opts: {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  checkInDate: Date;
  checkOutDate: Date;
  prefer?: string | null;
}) {
  const free = await getAvailableRooms(opts);
  const ids = free.map((r) => r.id).sort();
  const start = ids.length ? Math.floor(Math.random() * ids.length) : 0;
  const rotated = [...ids.slice(start), ...ids.slice(0, start)];
  if (opts.prefer) return [opts.prefer, ...rotated.filter((id) => id !== opts.prefer)];
  return rotated;
}

async function findByIdempotencyKey(tenantId: string, key: string, requestHash: string) {
  const prior = await prisma.accommodationReservation.findFirst({
    where: { tenantId, idempotencyKey: key },
    include: RESERVATION_INCLUDE,
  });
  if (!prior) return null;
  if (prior.requestHash !== requestHash) {
    throw httpError("This idempotency key was already used for a different reservation", "idempotency_key_reused", 409);
  }
  return prior;
}

export type ReserveStayInput = {
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
  /** Retrying with the same key returns the original reservation instead of a second one. */
  idempotencyKey?: string | null;
  actorKind: string;
  actorId?: string | null;
};

/**
 * Create a reservation. For a blocking status its nights are claimed on a room in the
 * same transaction, so concurrent requests cannot double-book: a loser rolls back whole
 * and, when no specific room was asked for, the next free room of the type is tried.
 */
export async function reserveStay(opts: ReserveStayInput) {
  const checkInDate = startOfDay(opts.checkInDate);
  const checkOutDate = startOfDay(opts.checkOutDate);
  if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
    throw httpError("Invalid check-in or check-out date", "validation_error", 400);
  }
  if (checkOutDate <= checkInDate) {
    throw httpError("Check-out must be after check-in", "validation_error", 400);
  }
  const status = opts.status ?? "confirmed";
  if (!["draft", "pending", "confirmed"].includes(status)) {
    throw httpError(`A reservation cannot be created as ${status}`, "validation_error", 400);
  }
  const blocking = isBlocking(status);
  const adults = opts.adults ?? 1;
  const children = opts.children ?? 0;

  const property = await prisma.property.findFirst({
    where: { id: opts.propertyId, tenantId: opts.tenantId, status: "active" },
  });
  if (!property) throw httpError("Property not found", "not_found", 404);
  const roomType = await prisma.roomType.findFirst({
    where: { id: opts.roomTypeId, tenantId: opts.tenantId, propertyId: opts.propertyId, status: "active" },
  });
  if (!roomType) throw httpError("Room type not found", "not_found", 404);
  const customer = await prisma.customer.findFirst({
    where: { id: opts.customerId, tenantId: opts.tenantId },
  });
  if (!customer) throw httpError("Guest profile not found", "not_found", 404);

  const key = opts.idempotencyKey?.trim() || null;
  const requestHash = reservationRequestHash({
    propertyId: opts.propertyId,
    roomTypeId: opts.roomTypeId,
    roomId: opts.roomId ?? null,
    customerId: opts.customerId,
    checkInDate,
    checkOutDate,
    adults,
    children,
    status,
  });
  if (key) {
    const prior = await findByIdempotencyKey(opts.tenantId, key, requestHash);
    if (prior) return { reservation: prior, replayed: true as const };
  }

  let candidates: Array<string | null>;
  if (opts.roomId) {
    candidates = [opts.roomId];
  } else if (blocking) {
    candidates = await candidateRooms({
      tenantId: opts.tenantId,
      propertyId: opts.propertyId,
      roomTypeId: opts.roomTypeId,
      checkInDate,
      checkOutDate,
    });
    if (!candidates.length) {
      throw httpError("No rooms available for the selected dates", "room_unavailable", 409);
    }
  } else {
    candidates = [null];
  }

  for (const candidate of candidates) {
    try {
      const reservation = await inReservationTransaction(async (tx) => {
        const room = candidate
          ? await loadReservableRoom(tx, {
              tenantId: opts.tenantId,
              propertyId: opts.propertyId,
              roomTypeId: opts.roomTypeId,
              roomId: candidate,
            })
          : null;
        const created = await tx.accommodationReservation.create({
          data: {
            tenantId: opts.tenantId,
            propertyId: opts.propertyId,
            roomTypeId: opts.roomTypeId,
            roomId: room?.id ?? null,
            customerId: opts.customerId,
            status,
            checkInDate,
            checkOutDate,
            adults,
            children,
            confirmationCode: confirmationCode(),
            internalNotes: opts.internalNotes ?? null,
            guestNotes: opts.guestNotes ?? null,
            idempotencyKey: key,
            requestHash: key ? requestHash : null,
            guests: {
              create: [{
                tenantId: opts.tenantId,
                fullName: opts.guestName ?? customer.displayName,
                email: opts.guestEmail ?? customer.email,
                isPrimary: true,
              }],
            },
          },
        });

        let bookingId: string | null = null;
        if (room && blocking) {
          await holdNights(tx, {
            tenantId: opts.tenantId,
            roomId: room.id,
            reservationId: created.id,
            checkInDate,
            checkOutDate,
          });
          const mirror = await writeStayMirror(tx, {
            tenantId: opts.tenantId,
            customerId: opts.customerId,
            roomId: room.id,
            roomNumber: room.number,
            propertyCode: property.code,
            startsAt: checkInDate,
            endsAt: checkOutDate,
            partySize: adults + children,
            notes: opts.guestNotes ?? null,
            internalNotes: opts.internalNotes ?? null,
            status: status as BookingStatus,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
          });
          bookingId = mirror.id;
          await tx.accommodationReservation.update({ where: { id: created.id }, data: { bookingId } });
          await tx.room.update({ where: { id: room.id }, data: { occupancyStatus: "reserved" } });
        }

        await addTimeline(
          {
            tenantId: opts.tenantId,
            reservationId: created.id,
            eventType: "reservation.created",
            message: `Reservation ${created.confirmationCode} created (${status})`,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
            metadata: bookingId ? { bookingId } : {},
          },
          tx,
        );
        await writeAudit(
          {
            tenantId: opts.tenantId,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
            action: "reservation.created",
            resource: "reservation",
            resourceId: created.id,
            metadata: { confirmationCode: created.confirmationCode, status, bookingId, roomId: room?.id ?? null },
          },
          tx,
        );
        return tx.accommodationReservation.findUniqueOrThrow({
          where: { id: created.id },
          include: RESERVATION_INCLUDE,
        });
      });

      if (blocking) {
        await afterCommit("reservation notification", () =>
          createNotification({
            tenantId: opts.tenantId,
            actorKind: "guest",
            actorId: opts.customerId,
            title: "Reservation confirmed",
            body: `Your stay ${reservation.confirmationCode} is ${status}.`,
            metadata: { reservationId: reservation.id, bookingId: reservation.bookingId },
          }),
        );
        const nights = stayNightCount(checkInDate, checkOutDate);
        await afterCommit("stay invoice", () =>
          tryEnsureLifecycleInvoice({
            vertical: "accommodation",
            tenantId: opts.tenantId,
            customerId: opts.customerId,
            sourceEntityId: reservation.id,
            description: `Stay ${reservation.confirmationCode} · ${nights} night(s) · ${roomType.name}`,
            unitAmountMinor: roomType.baseRate,
            quantity: nights,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
          }),
        );
      }
      return { reservation, replayed: false as const };
    } catch (err) {
      if (key && isIdempotencyKeyConflict(err)) {
        const prior = await findByIdempotencyKey(opts.tenantId, key, requestHash);
        if (prior) return { reservation: prior, replayed: true as const };
      }
      const code = (err as { code?: string }).code;
      if (isRoomNightConflict(err) || code === "room_unavailable") {
        if (opts.roomId) throw roomUnavailable();
        continue;
      }
      // A room picked by the system that went out of service meanwhile is just skipped.
      if (!opts.roomId && code === "room_not_reservable") continue;
      throw err;
    }
  }
  throw httpError("No rooms available for the selected dates", "room_unavailable", 409);
}

/** Backward-compatible form of reserveStay that returns only the reservation. */
export async function createReservation(opts: ReserveStayInput) {
  return (await reserveStay(opts)).reservation;
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
    include: { property: true },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (["checked_out", "cancelled", "no_show"].includes(existing.status)) {
    throw httpError("Reservation can no longer be modified", "invalid_state", 409);
  }
  if (opts.status && opts.status !== existing.status) {
    if (!EDITABLE_STATUSES.includes(opts.status) || existing.status === "checked_in") {
      throw httpError(
        "Check-in and check-out have their own actions; a checked-in stay ends with check-out",
        "invalid_transition",
        409,
      );
    }
    if (opts.status === "cancelled") {
      return cancelReservation({
        tenantId: opts.tenantId,
        reservationId: existing.id,
        actorKind: opts.actorKind,
        actorId: opts.actorId,
      });
    }
  }

  const status = opts.status ?? existing.status;
  const blocking = isBlocking(status);
  const checkInDate = opts.checkInDate ? startOfDay(opts.checkInDate) : existing.checkInDate;
  const checkOutDate = opts.checkOutDate ? startOfDay(opts.checkOutDate) : existing.checkOutDate;
  if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
    throw httpError("Invalid check-in or check-out date", "validation_error", 400);
  }
  if (checkOutDate <= checkInDate) {
    throw httpError("Check-out must be after check-in", "validation_error", 400);
  }
  const adults = opts.adults ?? existing.adults;
  const children = opts.children ?? existing.children;
  const internalNotes = opts.internalNotes !== undefined ? opts.internalNotes : existing.internalNotes;
  const guestNotes = opts.guestNotes !== undefined ? opts.guestNotes : existing.guestNotes;

  // A specific room (asked for, or the one already held) is the only candidate;
  // clearing the room on a blocking reservation lets any free room of its type be used.
  const explicitRoom = opts.roomId ?? (opts.roomId === null ? null : existing.roomId);
  let candidates: Array<string | null>;
  if (!blocking) candidates = [explicitRoom];
  else if (explicitRoom) candidates = [explicitRoom];
  else {
    candidates = await candidateRooms({
      tenantId: opts.tenantId,
      propertyId: existing.propertyId,
      roomTypeId: existing.roomTypeId,
      checkInDate,
      checkOutDate,
    });
    if (!candidates.length) throw httpError("No availability for the updated dates", "room_unavailable", 409);
  }

  for (const candidate of candidates) {
    try {
      const updated = await inReservationTransaction(async (tx) => {
        const room = candidate
          ? await loadReservableRoom(tx, {
              tenantId: opts.tenantId,
              propertyId: existing.propertyId,
              roomTypeId: existing.status === "checked_in" ? undefined : existing.roomTypeId,
              roomId: candidate,
            })
          : null;
        const applied = await tx.accommodationReservation.updateMany({
          where: { id: existing.id, tenantId: opts.tenantId, status: existing.status, updatedAt: existing.updatedAt },
          data: { checkInDate, checkOutDate, adults, children, roomId: room?.id ?? null, internalNotes, guestNotes, status },
        });
        if (applied.count === 0) throw changedConcurrently();

        await releaseRoomNights(tx, existing.id);
        if (room && blocking) {
          await holdNights(tx, { tenantId: opts.tenantId, roomId: room.id, reservationId: existing.id, checkInDate, checkOutDate });
        }

        const roomChanged = (room?.id ?? null) !== existing.roomId;
        if (existing.bookingId) {
          await updateStayMirror(tx, {
            tenantId: opts.tenantId,
            bookingId: existing.bookingId,
            startsAt: checkInDate,
            endsAt: checkOutDate,
            partySize: adults + children,
            notes: guestNotes,
            internalNotes,
            status: status !== existing.status ? (status as BookingStatus) : undefined,
            room: room && roomChanged ? { roomId: room.id, roomNumber: room.number, propertyCode: existing.property.code } : undefined,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
          });
        } else if (room && blocking) {
          const mirror = await writeStayMirror(tx, {
            tenantId: opts.tenantId,
            customerId: existing.customerId,
            roomId: room.id,
            roomNumber: room.number,
            propertyCode: existing.property.code,
            startsAt: checkInDate,
            endsAt: checkOutDate,
            partySize: adults + children,
            notes: guestNotes,
            internalNotes,
            status: status as BookingStatus,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
          });
          await tx.accommodationReservation.update({ where: { id: existing.id }, data: { bookingId: mirror.id } });
        }

        await addTimeline(
          {
            tenantId: opts.tenantId,
            reservationId: existing.id,
            eventType: "reservation.updated",
            message: "Reservation updated",
            actorKind: opts.actorKind,
            actorId: opts.actorId,
            metadata: { status, roomId: room?.id ?? null },
          },
          tx,
        );
        await writeAudit(
          {
            tenantId: opts.tenantId,
            actorKind: opts.actorKind,
            actorId: opts.actorId,
            action: "reservation.modified",
            resource: "reservation",
            resourceId: existing.id,
            metadata: { status, roomId: room?.id ?? null },
          },
          tx,
        );
        return tx.accommodationReservation.findUniqueOrThrow({
          where: { id: existing.id },
          include: RESERVATION_INCLUDE,
        });
      });

      await afterCommit("reservation update notification", () =>
        createNotification({
          tenantId: opts.tenantId,
          actorKind: "guest",
          actorId: updated.customerId,
          title: "Reservation updated",
          body: `Your reservation ${updated.confirmationCode} was updated.`,
          metadata: { reservationId: updated.id },
        }),
      );
      return updated;
    } catch (err) {
      if (isRoomNightConflict(err) || (err as { code?: string }).code === "room_unavailable") {
        if (explicitRoom) throw roomUnavailable();
        continue;
      }
      throw err;
    }
  }
  throw httpError("No availability for the updated dates", "room_unavailable", 409);
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

  const updated = await inReservationTransaction(async (tx) => {
    const applied = await tx.accommodationReservation.updateMany({
      where: { id: existing.id, tenantId: opts.tenantId, status: { in: ["draft", "pending", "confirmed", "no_show"] } },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
    if (applied.count === 0) throw changedConcurrently();
    await releaseRoomNights(tx, existing.id);
    if (existing.bookingId) {
      await updateStayMirror(tx, {
        tenantId: opts.tenantId,
        bookingId: existing.bookingId,
        status: "cancelled",
        actorKind: opts.actorKind,
        actorId: opts.actorId,
      });
    }
    if (existing.roomId) {
      await tx.room.update({ where: { id: existing.roomId }, data: { occupancyStatus: "vacant" } });
    }
    await addTimeline(
      {
        tenantId: opts.tenantId,
        reservationId: existing.id,
        eventType: "reservation.cancelled",
        message: "Reservation cancelled",
        actorKind: opts.actorKind,
        actorId: opts.actorId,
      },
      tx,
    );
    await writeAudit(
      {
        tenantId: opts.tenantId,
        actorKind: opts.actorKind,
        actorId: opts.actorId,
        action: "reservation.cancelled",
        resource: "reservation",
        resourceId: existing.id,
      },
      tx,
    );
    return tx.accommodationReservation.findUniqueOrThrow({
      where: { id: existing.id },
      include: RESERVATION_INCLUDE,
    });
  });

  await afterCommit("cancellation notification", () =>
    createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: updated.customerId,
      title: "Reservation cancelled",
      body: `Reservation ${updated.confirmationCode} was cancelled.`,
      metadata: { reservationId: updated.id },
    }),
  );
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
    include: { property: true },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (!["confirmed", "pending"].includes(existing.status)) {
    throw httpError("Only confirmed/pending reservations can check in", "invalid_state", 409);
  }
  const roomId = opts.roomId ?? existing.roomId;
  if (!roomId) throw httpError("A room must be assigned for check-in", "room_required", 400);

  let reservation;
  try {
    reservation = await inReservationTransaction(async (tx) => {
      // Moving to a different room at the desk (an upgrade) may change the room type.
      const room = await loadReservableRoom(tx, { tenantId: opts.tenantId, propertyId: existing.propertyId, roomId });
      const now = new Date();
      const applied = await tx.accommodationReservation.updateMany({
        where: { id: existing.id, tenantId: opts.tenantId, status: { in: ["confirmed", "pending"] } },
        data: { status: "checked_in", roomId: room.id, checkedInAt: now },
      });
      if (applied.count === 0) throw changedConcurrently();
      const roomChanged = room.id !== existing.roomId;
      if (roomChanged) {
        await releaseRoomNights(tx, existing.id);
        await holdNights(tx, {
          tenantId: opts.tenantId,
          roomId: room.id,
          reservationId: existing.id,
          checkInDate: existing.checkInDate,
          checkOutDate: existing.checkOutDate,
        });
      }
      await tx.room.update({ where: { id: room.id }, data: { occupancyStatus: "occupied", housekeepingStatus: "dirty" } });
      await tx.stay.create({
        data: {
          tenantId: opts.tenantId,
          reservationId: existing.id,
          propertyId: existing.propertyId,
          roomId: room.id,
          customerId: existing.customerId,
          startedAt: now,
          status: "active",
        },
      });
      if (existing.bookingId) {
        await updateStayMirror(tx, {
          tenantId: opts.tenantId,
          bookingId: existing.bookingId,
          status: "checked_in",
          room: roomChanged ? { roomId: room.id, roomNumber: room.number, propertyCode: existing.property.code } : undefined,
          actorKind: opts.actorKind,
          actorId: opts.actorId,
        });
      }
      await addTimeline(
        {
          tenantId: opts.tenantId,
          reservationId: existing.id,
          eventType: "check_in",
          message: "Checked in to room",
          actorKind: opts.actorKind,
          actorId: opts.actorId,
          metadata: { roomId: room.id },
        },
        tx,
      );
      await writeAudit(
        {
          tenantId: opts.tenantId,
          actorKind: opts.actorKind,
          actorId: opts.actorId,
          action: "reservation.check_in",
          resource: "reservation",
          resourceId: existing.id,
          metadata: { roomId: room.id },
        },
        tx,
      );
      await writeAudit(
        {
          tenantId: opts.tenantId,
          actorKind: opts.actorKind,
          actorId: opts.actorId,
          action: "room.assigned",
          resource: "room",
          resourceId: room.id,
          metadata: { reservationId: existing.id },
        },
        tx,
      );
      return tx.accommodationReservation.findUniqueOrThrow({
        where: { id: existing.id },
        include: { ...RESERVATION_INCLUDE, stay: true },
      });
    });
  } catch (err) {
    if (isRoomNightConflict(err)) throw roomUnavailable();
    throw err;
  }

  await afterCommit("check-in notification", () =>
    createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Check-in complete",
      body: `Welcome — reservation ${existing.confirmationCode} is checked in.`,
      metadata: { reservationId: existing.id },
    }),
  );
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
  const roomId = existing.roomId;
  if (!roomId) throw httpError("Reservation has no room", "invalid_state", 409);

  const reservation = await inReservationTransaction(async (tx) => {
    const now = new Date();
    const applied = await tx.accommodationReservation.updateMany({
      where: { id: existing.id, tenantId: opts.tenantId, status: "checked_in" },
      data: { status: "checked_out", checkedOutAt: now },
    });
    if (applied.count === 0) throw changedConcurrently();
    // Nights from today on will not be stayed: leaving early frees them for others.
    await releaseRoomNights(tx, existing.id, now);
    await tx.room.update({ where: { id: roomId }, data: { occupancyStatus: "vacant", housekeepingStatus: "dirty" } });
    if (existing.stay) {
      await tx.stay.update({ where: { id: existing.stay.id }, data: { endedAt: now, status: "completed" } });
    }
    if (existing.bookingId) {
      await updateStayMirror(tx, {
        tenantId: opts.tenantId,
        bookingId: existing.bookingId,
        status: "checked_out",
        actorKind: opts.actorKind,
        actorId: opts.actorId,
      });
    }
    await addTimeline(
      {
        tenantId: opts.tenantId,
        reservationId: existing.id,
        eventType: "check_out",
        message: "Checked out",
        actorKind: opts.actorKind,
        actorId: opts.actorId,
      },
      tx,
    );
    await writeAudit(
      {
        tenantId: opts.tenantId,
        actorKind: opts.actorKind,
        actorId: opts.actorId,
        action: "reservation.check_out",
        resource: "reservation",
        resourceId: existing.id,
      },
      tx,
    );
    return tx.accommodationReservation.findUniqueOrThrow({
      where: { id: existing.id },
      include: { ...RESERVATION_INCLUDE, stay: true },
    });
  });

  await afterCommit("housekeeping notification", () =>
    createNotification({
      tenantId: opts.tenantId,
      actorKind: "staff",
      actorId: opts.actorId,
      title: "Housekeeping assigned",
      body: `Room needs cleaning after checkout of ${existing.confirmationCode}.`,
      metadata: { roomId, reservationId: existing.id },
    }),
  );
  // Ensure the stay invoice exists (idempotent BillableItem upsert) for final billing history.
  if (reservation.roomType && reservation.customerId) {
    const nights = stayNightCount(reservation.checkInDate, reservation.checkOutDate);
    await afterCommit("final stay invoice", () =>
      tryEnsureLifecycleInvoice({
        vertical: "accommodation",
        tenantId: opts.tenantId,
        customerId: reservation.customerId,
        sourceEntityId: reservation.id,
        description: `Stay ${reservation.confirmationCode} · final bill · ${nights} night(s)`,
        unitAmountMinor: reservation.roomType.baseRate,
        quantity: nights,
        actorKind: opts.actorKind,
        actorId: opts.actorId,
      }),
    );
  }
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
