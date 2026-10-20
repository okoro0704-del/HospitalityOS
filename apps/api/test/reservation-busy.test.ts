/**
 * Reservation transactions under contention: transient lock errors are retried and, if they
 * outlast the retries, become a retryable 503 — never a 400. Real conflicts are not retried.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./test.db";

const { inReservationTransaction, isRoomNightConflict } = await import("../src/services/room-allocation.js");

test("transient contention that outlasts the retries becomes 503 reservation_busy", async () => {
  let calls = 0;
  await assert.rejects(
    inReservationTransaction(async () => {
      calls++;
      throw new Error("SQLITE_BUSY: database is locked");
    }, 3),
    (err: unknown) => {
      const e = err as { code?: string; statusCode?: number };
      return e.code === "reservation_busy" && e.statusCode === 503;
    },
  );
  assert.equal(calls, 3, "retried up to the attempt limit");
});

test("a room-night conflict is an answer, not contention: no retry, no 503", async () => {
  let calls = 0;
  const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: Prisma.prismaVersion.client,
    meta: { target: ["roomId", "night"] },
  });
  assert.ok(isRoomNightConflict(conflict));
  await assert.rejects(
    inReservationTransaction(async () => {
      calls++;
      throw conflict;
    }, 5),
    (err: unknown) => err === conflict,
  );
  assert.equal(calls, 1);
});

test("other errors propagate unchanged after one attempt", async () => {
  let calls = 0;
  const boom = Object.assign(new Error("Room not found"), { code: "not_found", statusCode: 404 });
  await assert.rejects(
    inReservationTransaction(async () => {
      calls++;
      throw boom;
    }, 5),
    (err: unknown) => err === boom,
  );
  assert.equal(calls, 1);
});

test("on SQLite, reservation transactions run one at a time", async () => {
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 6 }, () =>
      inReservationTransaction(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return true;
      }),
    ),
  );
  assert.equal(peak, 1);
});
