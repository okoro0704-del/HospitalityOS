/**
 * Reservation integrity — concurrency, idempotency and lifecycle consistency.
 *
 * Runs against SQLite by default (own database file, schema pushed here). Set
 * HOS_INTEGRITY_DATABASE_URL to a disposable PostgreSQL database that already has the
 * migrations applied (see scripts/pg-integrity.mjs) to run the same assertions there;
 * the room-night unique index is then enforced by PostgreSQL itself.
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const pgUrl = process.env.HOS_INTEGRITY_DATABASE_URL ?? "";
const usingPostgres = pgUrl.startsWith("postgres");
const sqliteFile = path.join(apiRoot, "prisma", "integrity-test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = usingPostgres ? pgUrl : "file:./integrity-test.db";

const { prisma } = await import("../src/db.js");
const { hashPassword } = await import("../src/lib/crypto.js");

let app: FastifyInstance;
let token = "";
let seed: Awaited<ReturnType<typeof seedHotel>>;

const CONCURRENCY = Number(process.env.HOS_INTEGRITY_CONCURRENCY ?? 12);

async function seedHotel() {
  const slug = `integrity-${randomUUID().slice(0, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: "Integrity Hotel",
      businessType: "hotel",
      operatingHours: [],
      settings: {},
      status: "active",
      modules: { create: [{ moduleId: "accommodation", enabled: true, config: {} }] },
      staff: {
        create: [{
          displayName: "Front Desk Lead",
          email: `lead@${slug}.test`,
          passwordHash: hashPassword("synthetic-password-1"),
          role: "admin",
          branchIds: [],
        }],
      },
    },
  });
  const otherTenant = await prisma.tenant.create({
    data: {
      slug: `${slug}-other`, name: "Other Hotel", businessType: "hotel",
      operatingHours: [], settings: {}, status: "active",
      modules: { create: [{ moduleId: "accommodation", enabled: true, config: {} }] },
    },
  });
  const property = await prisma.property.create({
    data: { tenantId: tenant.id, name: "Main", code: "MAIN", propertyType: "hotel", inheritBranding: true },
  });
  const roomType = await prisma.roomType.create({
    data: { tenantId: tenant.id, propertyId: property.id, name: "Standard", code: "STD", capacity: 2, baseRate: 10_000, photoUrls: [] },
  });
  const rooms = [];
  for (const number of ["101", "102", "103"]) {
    rooms.push(await prisma.room.create({
      data: { tenantId: tenant.id, propertyId: property.id, roomTypeId: roomType.id, number },
    }));
  }
  const otherProperty = await prisma.property.create({
    data: { tenantId: otherTenant.id, name: "Other", code: "OTH", propertyType: "hotel", inheritBranding: true },
  });
  const otherRoomType = await prisma.roomType.create({
    data: { tenantId: otherTenant.id, propertyId: otherProperty.id, name: "Other", code: "OTH", capacity: 2, baseRate: 1, photoUrls: [] },
  });
  const otherRoom = await prisma.room.create({
    data: { tenantId: otherTenant.id, propertyId: otherProperty.id, roomTypeId: otherRoomType.id, number: "9" },
  });
  const guests = [];
  for (let i = 0; i < CONCURRENCY + 4; i++) {
    guests.push(await prisma.customer.create({
      data: { tenantId: tenant.id, displayName: `Synthetic Guest ${i}`, preferences: {}, loyaltyPlaceholder: {}, metadata: {} },
    }));
  }
  return { tenant, slug, property, roomType, rooms, guests, otherProperty, otherRoomType, otherRoom };
}

/** Dates far enough ahead that no notice/advance rule interferes, distinct per test. */
let dateCursor = Date.UTC(2031, 0, 5);
function stay(nights: number, gapAfter = 30) {
  const start = new Date(dateCursor);
  const end = new Date(dateCursor + nights * 86_400_000);
  dateCursor += (nights + gapAfter) * 86_400_000;
  return { checkInDate: start.toISOString().slice(0, 10), checkOutDate: end.toISOString().slice(0, 10) };
}

function reserve(payload: Record<string, unknown>, idempotencyKey?: string) {
  return app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: {
      authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    payload: { propertyId: seed.property.id, roomTypeId: seed.roomType.id, status: "confirmed", ...payload },
  });
}

/** Database-level invariant: no room has two blocking reservations on the same night. */
async function assertNoDoubleBookedNights() {
  const reservations = await prisma.accommodationReservation.findMany({
    where: { tenantId: seed.tenant.id, status: { in: ["pending", "confirmed", "checked_in"] } },
  });
  const seen = new Map<string, string>();
  for (const r of reservations) {
    assert.ok(r.roomId, `blocking reservation ${r.id} has no room`);
    for (let t = r.checkInDate.getTime(); t < r.checkOutDate.getTime(); t += 86_400_000) {
      const key = `${r.roomId}|${t}`;
      assert.ok(!seen.has(key), `room ${r.roomId} double-booked on ${new Date(t).toISOString().slice(0, 10)} by ${seen.get(key)} and ${r.id}`);
      seen.set(key, r.id);
    }
    const ledger = await prisma.roomNightAllocation.count({ where: { reservationId: r.id, roomId: r.roomId! } });
    assert.equal(ledger, Math.round((r.checkOutDate.getTime() - r.checkInDate.getTime()) / 86_400_000), `ledger rows for ${r.id}`);
  }
  const orphanNights = await prisma.roomNightAllocation.count({
    where: { tenantId: seed.tenant.id, reservation: { status: { notIn: ["pending", "confirmed", "checked_in", "checked_out"] } } },
  });
  assert.equal(orphanNights, 0, "nights held by cancelled / no-show / draft reservations");
}

before(async () => {
  if (!usingPostgres) {
    for (const f of [sqliteFile, `${sqliteFile}-journal`]) if (fs.existsSync(f)) fs.unlinkSync(f);
    execSync("npx prisma db push --skip-generate", {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: "file:./integrity-test.db" },
      stdio: "pipe",
    });
  }
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
  await app.ready();
});

beforeEach(async () => {
  seed = await seedHotel();
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: seed.slug, email: `lead@${seed.slug}.test`, password: "synthetic-password-1" },
  });
  assert.equal(login.statusCode, 200, login.body);
  token = login.json().token;
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

test("one room, many simultaneous requests for the same nights: exactly one wins", async () => {
  const dates = stay(3);
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[i].id }),
    ),
  );
  const ok = results.filter((r) => r.statusCode === 200);
  const conflicts = results.filter((r) => r.statusCode === 409);
  const summary = results.map((r) => `${r.statusCode}:${r.json().error ?? ""}`).join(",");
  assert.equal(ok.length, 1, summary);
  assert.equal(conflicts.length, CONCURRENCY - 1, summary);
  for (const r of conflicts) assert.equal(r.json().error, "room_unavailable");
  await assertNoDoubleBookedNights();
});

test("room-type requests under contention fill every room once and never oversell", async () => {
  const dates = stay(2);
  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => reserve({ ...dates, customerId: seed.guests[i].id })),
  );
  const ok = results.filter((r) => r.statusCode === 200);
  assert.equal(ok.length, seed.rooms.length, "every available room is sold, none twice");
  const roomIds = new Set(ok.map((r) => r.json().reservation.roomId));
  assert.equal(roomIds.size, seed.rooms.length, "each success got a different room");
  const summary = results.map((r) => `${r.statusCode}:${r.json().error ?? ""}`).join(",");
  for (const r of results.filter((x) => x.statusCode !== 200)) {
    assert.equal(r.statusCode, 409, summary);
    assert.equal(r.json().error, "room_unavailable");
  }
  await assertNoDoubleBookedNights();
});

test("idempotent retries return the original reservation and never duplicate it", async () => {
  const dates = stay(2);
  const key = `idem-${randomUUID()}`;
  const body = { ...dates, customerId: seed.guests[0].id };
  const results = await Promise.all(Array.from({ length: 6 }, () => reserve(body, key)));
  for (const r of results) assert.equal(r.statusCode, 200, r.body);
  const ids = new Set(results.map((r) => r.json().reservation.id));
  assert.equal(ids.size, 1, "all retries resolve to one reservation");
  assert.equal(results.filter((r) => r.json().replayed === false).length, 1, "exactly one request created it");
  const count = await prisma.accommodationReservation.count({ where: { tenantId: seed.tenant.id, idempotencyKey: key } });
  assert.equal(count, 1);

  const later = await reserve(body, key);
  assert.equal(later.statusCode, 200);
  assert.equal(later.json().reservation.id, [...ids][0]);
  assert.equal(later.json().replayed, true);

  const reused = await reserve({ ...body, customerId: seed.guests[1].id }, key);
  assert.equal(reused.statusCode, 409);
  assert.equal(reused.json().error, "idempotency_key_reused");
  await assertNoDoubleBookedNights();
});

test("different rooms and back-to-back stays stay bookable", async () => {
  const first = stay(2, 0);
  const second = stay(2, 30); // check-in on the first stay's check-out day
  const a = await reserve({ ...first, roomId: seed.rooms[0].id, customerId: seed.guests[0].id });
  const b = await reserve({ ...second, roomId: seed.rooms[0].id, customerId: seed.guests[1].id });
  const c = await reserve({ ...first, roomId: seed.rooms[1].id, customerId: seed.guests[2].id });
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(b.statusCode, 200, b.body);
  assert.equal(c.statusCode, 200, c.body);
  await assertNoDoubleBookedNights();
});

test("cancellation releases the nights; the room can be rebooked", async () => {
  const dates = stay(3);
  const a = await reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[0].id });
  assert.equal(a.statusCode, 200, a.body);
  const blocked = await reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[1].id });
  assert.equal(blocked.statusCode, 409);

  const cancel = await app.inject({
    method: "POST",
    url: `/accommodation/reservations/${a.json().reservation.id}/cancel`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  });
  assert.equal(cancel.statusCode, 200, cancel.body);
  assert.equal(await prisma.roomNightAllocation.count({ where: { reservationId: a.json().reservation.id } }), 0);

  const rebooked = await reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[1].id });
  assert.equal(rebooked.statusCode, 200, rebooked.body);
  await assertNoDoubleBookedNights();
});

test("changing dates or room is atomic: a conflicting change leaves the original intact", async () => {
  const mine = stay(2, 0);
  const theirs = stay(2);
  const a = await reserve({ ...mine, roomId: seed.rooms[0].id, customerId: seed.guests[0].id });
  const b = await reserve({ ...theirs, roomId: seed.rooms[0].id, customerId: seed.guests[1].id });
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(b.statusCode, 200, b.body);
  const idA = a.json().reservation.id as string;

  // Extend A into B's nights: must fail and leave A exactly as it was.
  const clash = await app.inject({
    method: "PATCH",
    url: `/accommodation/reservations/${idA}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { checkOutDate: theirs.checkOutDate },
  });
  assert.equal(clash.statusCode, 409, clash.body);
  const still = await prisma.accommodationReservation.findUniqueOrThrow({ where: { id: idA } });
  assert.equal(still.checkOutDate.toISOString().slice(0, 10), mine.checkOutDate);
  assert.equal(await prisma.roomNightAllocation.count({ where: { reservationId: idA } }), 2);

  // Move A to another room: nights move with it.
  const moved = await app.inject({
    method: "PATCH",
    url: `/accommodation/reservations/${idA}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { roomId: seed.rooms[1].id },
  });
  assert.equal(moved.statusCode, 200, moved.body);
  assert.equal(await prisma.roomNightAllocation.count({ where: { reservationId: idA, roomId: seed.rooms[1].id } }), 2);
  assert.equal(await prisma.roomNightAllocation.count({ where: { reservationId: idA, roomId: seed.rooms[0].id } }), 0);
  await assertNoDoubleBookedNights();
});

test("a stay that conflicts on its last night leaves nothing behind", async () => {
  const dates = stay(3, 0);
  const lastNight = { checkInDate: new Date(Date.parse(dates.checkOutDate) - 86_400_000).toISOString().slice(0, 10), checkOutDate: dates.checkOutDate };
  const holder = await reserve({ ...lastNight, roomId: seed.rooms[0].id, customerId: seed.guests[0].id });
  assert.equal(holder.statusCode, 200, holder.body);
  const before = await prisma.accommodationReservation.count({ where: { tenantId: seed.tenant.id } });

  const attempt = await reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[1].id });
  assert.equal(attempt.statusCode, 409);
  assert.equal(await prisma.accommodationReservation.count({ where: { tenantId: seed.tenant.id } }), before, "no reservation row left");
  assert.equal(await prisma.roomNightAllocation.count({ where: { tenantId: seed.tenant.id } }), 1, "no partial nights left");
  const engineBookings = await prisma.booking.count({ where: { tenantId: seed.tenant.id, moduleId: "accommodation" } });
  assert.equal(engineBookings, 1, "no booking-engine mirror left behind");
});

test("concurrent cancel and re-book of the same room never double-books", async () => {
  const dates = stay(2);
  const a = await reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[0].id });
  assert.equal(a.statusCode, 200, a.body);
  const [cancel, ...rebooks] = await Promise.all([
    app.inject({
      method: "POST",
      url: `/accommodation/reservations/${a.json().reservation.id}/cancel`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    }),
    ...Array.from({ length: 4 }, (_, i) => reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[i + 1].id })),
  ]);
  assert.equal(cancel.statusCode, 200, cancel.body);
  assert.ok(rebooks.filter((r) => r.statusCode === 200).length <= 1);
  await assertNoDoubleBookedNights();
});

test("check-in cannot move a guest into a room someone else holds", async () => {
  const dates = stay(3);
  const a = await reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[0].id });
  const b = await reserve({ ...dates, roomId: seed.rooms[1].id, customerId: seed.guests[1].id });
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  const moveIn = await app.inject({
    method: "POST",
    url: `/accommodation/reservations/${a.json().reservation.id}/check-in`,
    headers: { authorization: `Bearer ${token}` },
    payload: { roomId: seed.rooms[1].id },
  });
  assert.equal(moveIn.statusCode, 409, moveIn.body);
  const still = await prisma.accommodationReservation.findUniqueOrThrow({ where: { id: a.json().reservation.id } });
  assert.equal(still.status, "confirmed", "a refused check-in leaves the reservation untouched");
  await assertNoDoubleBookedNights();
});

test("checking out early releases the nights that will not be stayed", async () => {
  const dates = stay(3);
  const a = await reserve({ ...dates, roomId: seed.rooms[2].id, customerId: seed.guests[0].id });
  assert.equal(a.statusCode, 200, a.body);
  const id = a.json().reservation.id as string;
  for (const step of ["check-in", "check-out"]) {
    const res = await app.inject({
      method: "POST",
      url: `/accommodation/reservations/${id}/${step}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    assert.equal(res.statusCode, 200, `${step}: ${res.body}`);
  }
  // The stay was booked for future nights and ended today, so every night is free again.
  assert.equal(await prisma.roomNightAllocation.count({ where: { reservationId: id } }), 0);
  const rebook = await reserve({ ...dates, roomId: seed.rooms[2].id, customerId: seed.guests[1].id });
  assert.equal(rebook.statusCode, 200, rebook.body);
});

test("a reservation cannot be moved to checked-in or checked-out by a plain edit", async () => {
  const dates = stay(1);
  const a = await reserve({ ...dates, customerId: seed.guests[0].id });
  assert.equal(a.statusCode, 200, a.body);
  for (const status of ["checked_in", "checked_out"]) {
    const res = await app.inject({
      method: "PATCH",
      url: `/accommodation/reservations/${a.json().reservation.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status },
    });
    assert.equal(res.statusCode, 409, `${status}: ${res.body}`);
  }
});

test("the generic booking API cannot book a room or change a stay behind the ledger's back", async () => {
  const dates = stay(2);
  const a = await reserve({ ...dates, roomId: seed.rooms[0].id, customerId: seed.guests[0].id });
  assert.equal(a.statusCode, 200, a.body);
  const roomResource = await prisma.bookableResource.findFirstOrThrow({
    where: { tenantId: seed.tenant.id, sourceType: "accommodation_room", sourceId: seed.rooms[0].id },
  });

  const direct = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      moduleId: "accommodation",
      customerId: seed.guests[1].id,
      startsAt: `${dates.checkInDate}T00:00:00.000Z`,
      endsAt: `${dates.checkOutDate}T00:00:00.000Z`,
      items: [{ resourceId: roomResource.id }],
    },
  });
  assert.equal(direct.statusCode, 409, direct.body);
  assert.equal(direct.json().error, "managed_by_accommodation");

  const cancelMirror = await app.inject({
    method: "POST",
    url: `/booking/bookings/${a.json().reservation.bookingId}/cancel`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  });
  assert.equal(cancelMirror.statusCode, 409, cancelMirror.body);
  const reservation = await prisma.accommodationReservation.findUniqueOrThrow({ where: { id: a.json().reservation.id } });
  assert.equal(reservation.status, "confirmed");
  await assertNoDoubleBookedNights();
});

test("staff of one hotel cannot reserve another tenant's room", async () => {
  const dates = stay(1);
  const res = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      propertyId: seed.otherProperty.id,
      roomTypeId: seed.otherRoomType.id,
      roomId: seed.otherRoom.id,
      customerId: seed.guests[0].id,
      status: "confirmed",
      ...dates,
    },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(await prisma.roomNightAllocation.count({ where: { roomId: seed.otherRoom.id } }), 0);
});

test("the database itself rejects a second allocation of the same room-night", async () => {
  const dates = stay(1);
  const a = await reserve({ ...dates, roomId: seed.rooms[2].id, customerId: seed.guests[0].id });
  assert.equal(a.statusCode, 200, a.body);
  const shadow = await prisma.accommodationReservation.create({
    data: {
      tenantId: seed.tenant.id, propertyId: seed.property.id, roomTypeId: seed.roomType.id,
      customerId: seed.guests[1].id, status: "draft", confirmationCode: `RAW-${randomUUID().slice(0, 8)}`,
      checkInDate: new Date(dates.checkInDate), checkOutDate: new Date(dates.checkOutDate),
    },
  });
  await assert.rejects(
    prisma.roomNightAllocation.create({
      data: { tenantId: seed.tenant.id, roomId: seed.rooms[2].id, reservationId: shadow.id, night: new Date(dates.checkInDate) },
    }),
    (err: unknown) => (err as { code?: string }).code === "P2002",
  );
});
