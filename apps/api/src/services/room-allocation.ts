import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";

/**
 * Room-night ledger.
 *
 * A blocking reservation (pending, confirmed, checked-in) owns one RoomNightAllocation
 * row per night of its stay on its assigned room. The unique (roomId, night) index is
 * what makes a double booking impossible: whichever transaction inserts a night second
 * fails, and because the reservation row is written in the same transaction it is
 * rolled back with it. Availability reads are advisory; this index is the guarantee.
 */

/** The application's Prisma client, or the client of an interactive transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 86_400_000;

export function utcMidnight(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** UTC midnight of every night in [checkIn, checkOut). */
export function stayNights(checkInDate: Date, checkOutDate: Date): Date[] {
  const nights: Date[] = [];
  const end = utcMidnight(checkOutDate).getTime();
  for (let t = utcMidnight(checkInDate).getTime(); t < end; t += DAY_MS) nights.push(new Date(t));
  return nights;
}

export async function claimRoomNights(
  db: Db,
  opts: { tenantId: string; roomId: string; reservationId: string; checkInDate: Date; checkOutDate: Date },
) {
  const nights = stayNights(opts.checkInDate, opts.checkOutDate);
  await db.roomNightAllocation.createMany({
    data: nights.map((night) => ({
      tenantId: opts.tenantId,
      roomId: opts.roomId,
      reservationId: opts.reservationId,
      night,
    })),
  });
}

/** Release a reservation's nights — all of them, or only those from `fromNight` on. */
export async function releaseRoomNights(db: Db, reservationId: string, fromNight?: Date) {
  await db.roomNightAllocation.deleteMany({
    where: { reservationId, ...(fromNight ? { night: { gte: utcMidnight(fromNight) } } : {}) },
  });
}

function uniqueTarget(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  return JSON.stringify(err.meta?.target ?? "");
}

/** The room already has one of these nights. */
export function isRoomNightConflict(err: unknown): boolean {
  const target = uniqueTarget(err);
  return target !== null && target.includes("night");
}

/** Another request already used this idempotency key. */
export function isIdempotencyKeyConflict(err: unknown): boolean {
  const target = uniqueTarget(err);
  return target !== null && target.toLowerCase().includes("idempotency");
}

/**
 * Errors a fresh attempt can succeed past: lock contention (SQLite busy, Postgres
 * deadlock/serialization) and incidental unique collisions such as two first-time
 * inserts of the same booking-engine category row or a confirmation-code clash.
 * Room-night and idempotency-key collisions are answers, not accidents, so they
 * are never retried here.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return !isRoomNightConflict(err) && !isIdempotencyKeyConflict(err);
    return ["P2034", "P2028", "P2024", "P1008"].includes(err.code);
  }
  const message = err instanceof Error ? err.message : String(err);
  return /database is locked|SQLITE_BUSY|could not serialize|deadlock detected/i.test(message);
}

/**
 * SQLite (development and tests only) has a single writer: concurrent write transactions
 * fail with busy/deadlock errors rather than waiting their turn. Queue reservation
 * transactions in-process there. PostgreSQL is not queued — its row locks and the
 * room-night unique index arbitrate concurrent transactions.
 */
let sqliteQueue: Promise<unknown> = Promise.resolve();
function queuedOnSqlite<T>(work: () => Promise<T>): Promise<T> {
  if (!config.databaseUrl.startsWith("file:")) return work();
  const run = sqliteQueue.then(work, work);
  sqliteQueue = run.catch(() => undefined);
  return run;
}

/** Transient contention outlasted the retries: the client may retry; nothing was written. */
export function reservationBusy() {
  return Object.assign(new Error("Reservations are busy right now; please retry shortly"), {
    code: "reservation_busy",
    statusCode: 503,
  });
}

/**
 * Run `fn` in one interactive transaction, retrying the errors above with exponential
 * backoff and jitter. Every other error — including a room-night conflict — propagates
 * after the transaction has rolled back, so nothing it wrote survives. Contention that
 * outlasts the retries becomes `503 reservation_busy`, never a client error.
 */
export async function inReservationTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 8,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await queuedOnSqlite(() => prisma.$transaction(fn, { maxWait: 15_000, timeout: 30_000 }));
    } catch (err) {
      if (!isRetryable(err)) throw err;
      if (attempt >= attempts) throw reservationBusy();
      const backoff = Math.min(1_500, 40 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, backoff + Math.floor(Math.random() * 50)));
    }
  }
}

/** Stable fingerprint of a reservation request, so a reused idempotency key can be checked. */
export function reservationRequestHash(fields: Record<string, unknown>): string {
  const canonical = Object.keys(fields)
    .sort()
    .map((k) => [k, fields[k] instanceof Date ? (fields[k] as Date).toISOString() : (fields[k] ?? null)]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
