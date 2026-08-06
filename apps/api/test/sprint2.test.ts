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
import { clearSpaModule } from "./helpers/cleanup-spa.js";
import { clearEventsModule } from "./helpers/cleanup-events.js";
import { clearCinemaModule } from "./helpers/cleanup-cinema.js";
import { clearOperationsModule } from "./helpers/cleanup-operations.js";
import { clearCrmModule } from "./helpers/cleanup-crm.js";
import { clearNotificationsModule } from "./helpers/cleanup-notifications.js";
import { clearBillingModule } from "./helpers/cleanup-billing.js";

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
  await clearCrmModule(prisma);
  await clearOperationsModule(prisma);
  await clearCinemaModule(prisma);
  await clearEventsModule(prisma);
  await clearSpaModule(prisma);
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
  await clearBillingModule(prisma);
  await clearNotificationsModule(prisma);
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
          {
            displayName: "Viewer",
            email: "viewer@sunrise.hotel",
            passwordHash: hashPassword("password123"),
            role: "viewer",
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
  const room102 = await prisma.room.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      roomTypeId: roomType.id,
      number: "102",
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

  return { hotel, gym, property, roomType, room101, room102, guest };
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

test("module gate: gym tenant cannot access accommodation APIs", async () => {
  const auth = await staffLogin("peak-fitness", "admin@peak.fitness");
  const res = await app.inject({
    method: "GET",
    url: "/accommodation/properties",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("tenant isolation: hotel staff cannot see other tenant properties", async () => {
  const seed = await resetDb();
  const otherProp = await prisma.property.create({
    data: {
      tenantId: seed.gym.id,
      name: "Gym Loft",
      code: "LOFT",
      propertyType: "apartment",
      inheritBranding: true,
    },
  });
  // enable accommodation on gym temporarily to prove isolation via tenantId
  await prisma.tenantModule.create({
    data: { tenantId: seed.gym.id, moduleId: "accommodation", enabled: true, config: {} },
  });

  const hotelAuth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: `/accommodation/properties/${otherProp.id}`,
    headers: { authorization: `Bearer ${hotelAuth.token}` },
  });
  assert.equal(res.statusCode, 404);
});

test("reservation lifecycle: create → check-in → check-out", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const checkIn = "2030-05-01";
  const checkOut = "2030-05-03";

  const created = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      propertyId: seed.property.id,
      roomTypeId: seed.roomType.id,
      roomId: seed.room101.id,
      customerId: seed.guest.id,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      status: "confirmed",
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  const reservationId = created.json().reservation.id as string;

  const checkInRes = await app.inject({
    method: "POST",
    url: `/accommodation/reservations/${reservationId}/check-in`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { roomId: seed.room101.id },
  });
  assert.equal(checkInRes.statusCode, 200, checkInRes.body);
  assert.equal(checkInRes.json().reservation.status, "checked_in");

  const roomAfterIn = await prisma.room.findUniqueOrThrow({ where: { id: seed.room101.id } });
  assert.equal(roomAfterIn.occupancyStatus, "occupied");

  const checkOutRes = await app.inject({
    method: "POST",
    url: `/accommodation/reservations/${reservationId}/check-out`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {},
  });
  assert.equal(checkOutRes.statusCode, 200, checkOutRes.body);
  assert.equal(checkOutRes.json().reservation.status, "checked_out");

  const roomAfterOut = await prisma.room.findUniqueOrThrow({ where: { id: seed.room101.id } });
  assert.equal(roomAfterOut.occupancyStatus, "vacant");
  assert.equal(roomAfterOut.housekeepingStatus, "dirty");
});

test("room availability blocks overlapping reservations", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");

  const first = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      propertyId: seed.property.id,
      roomTypeId: seed.roomType.id,
      roomId: seed.room101.id,
      customerId: seed.guest.id,
      checkInDate: "2030-06-01",
      checkOutDate: "2030-06-05",
      status: "confirmed",
    },
  });
  assert.equal(first.statusCode, 200, first.body);

  const conflict = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      propertyId: seed.property.id,
      roomTypeId: seed.roomType.id,
      roomId: seed.room101.id,
      customerId: seed.guest.id,
      checkInDate: "2030-06-03",
      checkOutDate: "2030-06-06",
      status: "confirmed",
    },
  });
  assert.equal(conflict.statusCode, 409);
});

test("maintenance restrictions prevent reservations", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");

  const maint = await app.inject({
    method: "PATCH",
    url: `/accommodation/rooms/${seed.room101.id}/maintenance`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { status: "under_maintenance" },
  });
  assert.equal(maint.statusCode, 200);

  const blocked = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      propertyId: seed.property.id,
      roomTypeId: seed.roomType.id,
      roomId: seed.room101.id,
      customerId: seed.guest.id,
      checkInDate: "2030-07-01",
      checkOutDate: "2030-07-02",
      status: "confirmed",
    },
  });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.json().error, "room_not_reservable");
});

test("housekeeping workflow updates room status", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "PATCH",
    url: `/accommodation/rooms/${seed.room102.id}/housekeeping`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { status: "in_progress" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().room.housekeepingStatus, "in_progress");
});

test("role permissions: viewer cannot create reservations", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "viewer@sunrise.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      propertyId: seed.property.id,
      roomTypeId: seed.roomType.id,
      customerId: seed.guest.id,
      checkInDate: "2030-08-01",
      checkOutDate: "2030-08-02",
    },
  });
  assert.equal(res.statusCode, 403);
});

test("API validation rejects invalid reservation payload", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/accommodation/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { propertyId: "x" },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});

test("calendar generation returns rooms and range", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: `/accommodation/calendar?propertyId=${seed.property.id}&view=weekly&date=2030-05-01`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200);
  const calendar = res.json().calendar;
  assert.equal(calendar.view, "weekly");
  assert.ok(calendar.days.length === 7);
  assert.ok(calendar.rooms.length >= 2);
});

test("guest profile mapping via LifeOS handoff", async () => {
  await resetDb();
  const token = await mockLifeOs.issueToken({
    sub: "lifeos_ada",
    aud: "exp_sunrise_hotel",
    experience_id: "exp_sunrise_hotel",
    business_id: "biz_sunrise_hotel",
    display_name: "Ada Mapped",
    jti: "jti_guest_map",
  });
  mockLifeOs.setHandoff("hof_map", "exp_sunrise_hotel", token);

  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff: "hof_map", experienceId: "exp_sunrise_hotel" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  const guestToken = exchange.json().token as string;
  const customerId = exchange.json().customer.id as string;

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  assert.equal(customer.lifeosUserId, "lifeos_ada");
  assert.equal(customer.displayName, "Ada Mapped");

  const seed = {
    property: await prisma.property.findFirstOrThrow({
      where: { tenantId: exchange.json().session.tenantId },
    }),
  };
  const roomType = await prisma.roomType.findFirstOrThrow({
    where: { propertyId: seed.property.id },
  });

  const booking = await app.inject({
    method: "POST",
    url: "/guest/accommodation/reservations",
    headers: { authorization: `Bearer ${guestToken}` },
    payload: {
      propertyId: seed.property.id,
      roomTypeId: roomType.id,
      checkInDate: "2030-09-01",
      checkOutDate: "2030-09-03",
    },
  });
  assert.equal(booking.statusCode, 200, booking.body);

  const list = await app.inject({
    method: "GET",
    url: "/guest/accommodation/reservations",
    headers: { authorization: `Bearer ${guestToken}` },
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().reservations.length, 1);
});

test("reservation cancellation notifies and frees room", async () => {
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
      checkInDate: "2030-10-01",
      checkOutDate: "2030-10-02",
      status: "confirmed",
    },
  });
  const id = created.json().reservation.id as string;
  const cancel = await app.inject({
    method: "POST",
    url: `/accommodation/reservations/${id}/cancel`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {},
  });
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().reservation.status, "cancelled");
  const room = await prisma.room.findUniqueOrThrow({ where: { id: seed.room101.id } });
  assert.equal(room.occupancyStatus, "vacant");
  const notes = await prisma.notification.findMany({
    where: { tenantId: seed.hotel.id, title: "Reservation cancelled" },
  });
  assert.ok(notes.length >= 1);
});
