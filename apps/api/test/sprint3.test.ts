import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { hashPassword } from "../src/lib/crypto.js";
import { startMockLifeOs, type MockLifeOs } from "./helpers/mock-lifeos.js";
import { clearBookingEngine } from "./helpers/cleanup-booking.js";
import { clearCommerceEngine } from "./helpers/cleanup-commerce.js";
import { clearDiningModule } from "./helpers/cleanup-dining.js";
import { clearFitnessModule } from "./helpers/cleanup-fitness.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

let app: FastifyInstance;
let mockLifeOs: MockLifeOs;
const prisma = new PrismaClient();

const hours = [
  { day: "mon", open: "09:00", close: "17:00", closed: false },
  { day: "tue", open: "09:00", close: "17:00", closed: false },
  { day: "wed", open: "09:00", close: "17:00", closed: false },
  { day: "thu", open: "09:00", close: "17:00", closed: false },
  { day: "fri", open: "09:00", close: "17:00", closed: false },
  { day: "sat", open: null, close: null, closed: true },
  { day: "sun", open: null, close: null, closed: true },
];

async function resetDb() {
  await prisma.reservationTimeline.deleteMany();
  await prisma.reservationGuest.deleteMany();
  await prisma.stay.deleteMany();
  await prisma.guestNote.deleteMany();
  await prisma.accommodationReservation.deleteMany();
  await clearFitnessModule(prisma);
  await clearDiningModule(prisma);
  await clearCommerceEngine(prisma);
  await clearBookingEngine(prisma);
  await prisma.roomAvailability.deleteMany();
  await prisma.roomTypeAmenity.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.floor.deleteMany();
  await prisma.building.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.property.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.guestSession.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();

  const hotel = await prisma.tenant.create({
    data: {
      slug: "sunrise-hotel",
      name: "Sunrise Hotel",
      businessType: "hotel",
      experienceId: "exp_sunrise_hotel",
      lifeosBusinessId: "biz_sunrise_hotel",
      primaryColor: "#0F766E",
      secondaryColor: "#134E4A",
      accentColor: "#F59E0B",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "accommodation", enabled: true, config: {} },
          { moduleId: "events", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Hotel Admin",
            email: "admin@sunrise.hotel",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });

  const gym = await prisma.tenant.create({
    data: {
      slug: "peak-fitness",
      name: "Peak Fitness",
      businessType: "gym",
      experienceId: "exp_peak_fitness",
      lifeosBusinessId: "biz_peak_fitness",
      primaryColor: "#1D4ED8",
      secondaryColor: "#1E3A8A",
      accentColor: "#22D3EE",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [{ moduleId: "gym_membership", enabled: true, config: {} }],
      },
      staff: {
        create: [
          {
            displayName: "Gym Admin",
            email: "admin@peak.fitness",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });

  const property = await prisma.property.create({
    data: {
      tenantId: hotel.id,
      name: "Sunrise Main",
      code: "MAIN",
      propertyType: "hotel",
      timezone: "UTC",
      checkInTime: "15:00",
      checkOutTime: "11:00",
      inheritBranding: true,
    },
  });

  const roomType = await prisma.roomType.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      name: "Standard",
      code: "STD",
      capacity: 2,
      baseRate: 100,
      photoUrls: [],
    },
  });

  const room101 = await prisma.room.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      roomTypeId: roomType.id,
      number: "101",
    },
  });

  const guest = await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Ada Guest",
      email: "ada@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const guestB = await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Bob Guest",
      email: "bob@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { hotel, gym, property, roomType, room101, guest, guestB };
}

async function staffLogin(tenantSlug: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string };
}

async function guestLogin(suffix = "a") {
  const token = await mockLifeOs.issueToken({
    sub: `lifeos_guest_${suffix}`,
    aud: "exp_sunrise_hotel",
    experience_id: "exp_sunrise_hotel",
    business_id: "biz_sunrise_hotel",
    display_name: `Guest ${suffix}`,
    jti: `jti_s3_${suffix}_${Date.now()}`,
  });
  const handoff = `hof_s3_${suffix}_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_sunrise_hotel", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_sunrise_hotel" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  return exchange.json() as { token: string; session: { customerId: string } };
}

async function bootstrapResource(auth: { token: string }, opts?: { capacity?: number; code?: string }) {
  const boot = await app.inject({
    method: "POST",
    url: "/booking/bootstrap",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(boot.statusCode, 200, boot.body);
  const categories = boot.json().categories as Array<{ id: string; code: string }>;
  const events = categories.find((c) => c.code === "events") ?? categories[0]!;
  const code = opts?.code ?? `HALL-${Date.now()}`;
  const created = await app.inject({
    method: "POST",
    url: "/booking/resources",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Grand Hall",
      code,
      categoryId: events.id,
      moduleId: "events",
      capacity: opts?.capacity ?? 1,
      tags: ["hall"],
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  return created.json().resource as { id: string; capacity: number };
}

before(async () => {
  for (const file of [testDbPath, `${testDbPath}-journal`, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  mockLifeOs = await startMockLifeOs();
  config.lifeosApiUrl = mockLifeOs.baseUrl;
  config.lifeosJwksUrl = mockLifeOs.jwksUrl;
  app = await buildApp();
  await app.ready();
});

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  if (app) await app.close();
  if (mockLifeOs) await mockLifeOs.close();
  await prisma.$disconnect();
});

test("booking lifecycle: create -> transition -> cancel", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth);
  const startsAt = "2027-02-01T10:00:00.000Z";
  const endsAt = "2027-02-01T11:00:00.000Z";

  const created = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      startsAt,
      endsAt,
      status: "pending",
      items: [{ resourceId: resource.id }],
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  const bookingId = created.json().booking.id as string;
  assert.equal(created.json().booking.status, "pending");

  const confirmed = await app.inject({
    method: "POST",
    url: `/booking/bookings/${bookingId}/transition`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { status: "confirmed" },
  });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.equal(confirmed.json().booking.status, "confirmed");

  const cancelled = await app.inject({
    method: "POST",
    url: `/booking/bookings/${bookingId}/cancel`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  assert.equal(cancelled.json().booking.status, "cancelled");
});

test("conflict detection prevents double booking", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth);
  const payload = {
    moduleId: "events",
    startsAt: "2027-04-15T10:00:00.000Z",
    endsAt: "2027-04-15T12:00:00.000Z",
    items: [{ resourceId: resource.id }],
  };

  const first = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload,
  });
  assert.equal(first.statusCode, 200, first.body);

  const conflict = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload,
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error, "capacity_exceeded");

  const validate = await app.inject({
    method: "POST",
    url: "/booking/validate-conflict",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      resourceId: resource.id,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
    },
  });
  assert.equal(validate.statusCode, 200);
  assert.equal(validate.json().available, false);
});

test("availability and capacity validation", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth, { capacity: 2, code: `CAP-${Date.now()}` });
  const startsAt = "2027-03-01T10:00:00.000Z";
  const endsAt = "2027-03-01T11:00:00.000Z";

  const a = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      startsAt,
      endsAt,
      items: [{ resourceId: resource.id, quantity: 1 }],
    },
  });
  assert.equal(a.statusCode, 200, a.body);

  const avail = await app.inject({
    method: "GET",
    url: `/booking/availability?resourceId=${resource.id}&startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(avail.statusCode, 200);
  assert.equal(avail.json().available, true);
  assert.equal(avail.json().freeCapacity, 1);

  const b = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      startsAt,
      endsAt,
      items: [{ resourceId: resource.id, quantity: 1 }],
    },
  });
  assert.equal(b.statusCode, 200, b.body);

  const full = await app.inject({
    method: "GET",
    url: `/booking/availability?resourceId=${resource.id}&startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(full.json().available, false);
});

test("blackout periods block availability", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth, { code: `BLK-${Date.now()}` });

  const blackout = await app.inject({
    method: "POST",
    url: "/booking/blackouts",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Maintenance window",
      resourceId: resource.id,
      startsAt: "2027-05-15T00:00:00.000Z",
      endsAt: "2027-05-16T00:00:00.000Z",
      reason: "HVAC",
    },
  });
  assert.equal(blackout.statusCode, 200, blackout.body);

  const blocked = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      startsAt: "2027-05-15T10:00:00.000Z",
      endsAt: "2027-05-15T11:00:00.000Z",
      items: [{ resourceId: resource.id }],
    },
  });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.json().error, "blackout_conflict");
});

test("scheduling: create recurring weekly schedule", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth, { code: `SCH-${Date.now()}` });

  const schedule = await app.inject({
    method: "POST",
    url: "/booking/schedules",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Weekday mornings",
      kind: "weekly",
      resourceId: resource.id,
      moduleId: "events",
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  assert.equal(schedule.statusCode, 200, schedule.body);
  assert.equal(schedule.json().schedule.kind, "weekly");

  const list = await app.inject({
    method: "GET",
    url: "/booking/schedules",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().schedules.length >= 1);
});

test("policies enforce min duration", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth, { code: `POL-${Date.now()}` });

  // First valid booking materializes module-scoped policy via getPolicy("events")
  const seedBooking = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      startsAt: "2026-12-01T08:00:00.000Z",
      endsAt: "2026-12-01T09:00:00.000Z",
      items: [{ resourceId: resource.id }],
    },
  });
  assert.equal(seedBooking.statusCode, 200, seedBooking.body);

  const policiesRes = await app.inject({
    method: "GET",
    url: "/booking/policies",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  const policies = policiesRes.json().policies as Array<{ id: string; code: string; moduleId: string | null }>;
  const policy = policies.find((p) => p.code === "events_default" || p.moduleId === "events")!;
  assert.ok(policy, "events policy should exist");

  const patched = await app.inject({
    method: "PATCH",
    url: `/booking/policies/${policy.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { minDurationMinutes: 60 },
  });
  assert.equal(patched.statusCode, 200, patched.body);

  const tooShort = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      startsAt: "2026-12-02T10:00:00.000Z",
      endsAt: "2026-12-02T10:30:00.000Z",
      items: [{ resourceId: resource.id }],
    },
  });
  assert.equal(tooShort.statusCode, 409);
  assert.equal(tooShort.json().error, "policy_violation");
});

test("waitlist join and promotion on cancel", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth, { code: `WL-${Date.now()}` });
  const startsAt = "2026-12-10T10:00:00.000Z";
  const endsAt = "2026-12-10T11:00:00.000Z";

  const booked = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      customerId: seed.guest.id,
      startsAt,
      endsAt,
      items: [{ resourceId: resource.id }],
    },
  });
  assert.equal(booked.statusCode, 200, booked.body);
  const bookingId = booked.json().booking.id as string;

  const wait = await app.inject({
    method: "POST",
    url: "/booking/waitlist",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      customerId: seed.guestB.id,
      resourceId: resource.id,
      startsAt,
      endsAt,
    },
  });
  assert.equal(wait.statusCode, 200, wait.body);
  assert.equal(wait.json().entry.status, "waiting");

  const cancel = await app.inject({
    method: "POST",
    url: `/booking/bookings/${bookingId}/cancel`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(cancel.statusCode, 200, cancel.body);

  const entries = await prisma.waitlistEntry.findMany({
    where: { tenantId: seed.hotel.id, customerId: seed.guestB.id },
  });
  assert.ok(entries.some((e) => e.status === "promoted"));

  const notes = await prisma.notification.findMany({
    where: { tenantId: seed.hotel.id, actorId: seed.guestB.id },
  });
  assert.ok(notes.some((n) => n.title.includes("Waitlist")));
});

test("calendar generation for day/week/month", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth, { code: `CAL-${Date.now()}` });
  await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      moduleId: "events",
      startsAt: "2027-01-15T10:00:00.000Z",
      endsAt: "2027-01-15T11:00:00.000Z",
      items: [{ resourceId: resource.id }],
    },
  });

  for (const view of ["day", "week", "month"] as const) {
    const res = await app.inject({
      method: "GET",
      url: `/booking/calendar?view=${view}&date=2027-01-15`,
      headers: { authorization: `Bearer ${auth.token}` },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().calendar.view, view);
    assert.ok(res.json().calendar.resources.length >= 1);
    assert.ok(res.json().calendar.days.length >= 1);
  }
});

test("tenant isolation on booking resources", async () => {
  const hotelAuth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(hotelAuth, { code: `ISO-${Date.now()}` });
  const gymAuth = await staffLogin("peak-fitness", "admin@peak.fitness");

  const res = await app.inject({
    method: "GET",
    url: `/booking/bookings`,
    headers: { authorization: `Bearer ${gymAuth.token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().bookings.length, 0);

  await app.inject({
    method: "POST",
    url: "/booking/bootstrap",
    headers: { authorization: `Bearer ${gymAuth.token}` },
  });
  const gymResources = await app.inject({
    method: "GET",
    url: "/booking/resources",
    headers: { authorization: `Bearer ${gymAuth.token}` },
  });
  assert.equal(gymResources.statusCode, 200);
  assert.ok(!gymResources.json().resources.some((r: { id: string }) => r.id === resource.id));
});

test("API validation rejects invalid booking payload", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/booking/bookings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { moduleId: "events" },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});

test("accommodation compatibility: reservation links booking engine", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");

  const created = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      propertyId: seed.property.id,
      roomTypeId: seed.roomType.id,
      roomId: seed.room101.id,
      customerId: seed.guest.id,
      checkInDate: "2027-02-01",
      checkOutDate: "2027-02-03",
      status: "confirmed",
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  const reservation = created.json().reservation;
  assert.ok(reservation.bookingId, "reservation should link to booking");

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: reservation.bookingId },
    include: { items: true },
  });
  assert.equal(booking.moduleId, "accommodation");
  assert.equal(booking.status, "confirmed");
  assert.ok(booking.items.length >= 1);

  const resource = await prisma.bookableResource.findFirst({
    where: {
      tenantId: seed.hotel.id,
      sourceType: "accommodation_room",
      sourceId: seed.room101.id,
    },
  });
  assert.ok(resource);

  const checkIn = await app.inject({
    method: "POST",
    url: `/accommodation/reservations/${reservation.id}/check-in`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { roomId: seed.room101.id },
  });
  assert.equal(checkIn.statusCode, 200, checkIn.body);

  const afterIn = await prisma.booking.findUniqueOrThrow({ where: { id: reservation.bookingId } });
  assert.equal(afterIn.status, "checked_in");

  const checkOut = await app.inject({
    method: "POST",
    url: `/accommodation/reservations/${reservation.id}/check-out`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {},
  });
  assert.equal(checkOut.statusCode, 200, checkOut.body);
  const afterOut = await prisma.booking.findUniqueOrThrow({ where: { id: reservation.bookingId } });
  assert.equal(afterOut.status, "checked_out");
});

test("guest PWA can browse, book, and cancel via engine", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const resource = await bootstrapResource(auth, { code: `GST-${Date.now()}` });
  const guest = await guestLogin("pwa");

  const list = await app.inject({
    method: "GET",
    url: "/guest/booking/resources",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().resources.some((r: { id: string }) => r.id === resource.id));

  const booked = await app.inject({
    method: "POST",
    url: "/guest/booking/bookings",
    headers: { authorization: `Bearer ${guest.token}` },
    payload: {
      moduleId: "events",
      resourceId: resource.id,
      startsAt: "2027-03-01T10:00:00.000Z",
      endsAt: "2027-03-01T11:00:00.000Z",
    },
  });
  assert.equal(booked.statusCode, 200, booked.body);
  const bookingId = booked.json().booking.id as string;

  const mine = await app.inject({
    method: "GET",
    url: "/guest/booking/bookings",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(mine.statusCode, 200);
  assert.ok(mine.json().bookings.some((b: { id: string }) => b.id === bookingId));
  assert.ok(mine.json().bookings[0].timeline?.length >= 1);

  const cancelled = await app.inject({
    method: "POST",
    url: `/guest/booking/bookings/${bookingId}/cancel`,
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  assert.equal(cancelled.json().booking.status, "cancelled");
});
