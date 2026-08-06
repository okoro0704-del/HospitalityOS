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

  const restaurant = await prisma.tenant.create({
    data: {
      slug: "bella-restaurant",
      name: "Bella Restaurant",
      businessType: "restaurant",
      experienceId: "exp_bella_restaurant",
      lifeosBusinessId: "biz_bella_restaurant",
      primaryColor: "#9F1239",
      secondaryColor: "#4C0519",
      accentColor: "#FB7185",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "restaurant", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Host Admin",
            email: "admin@bella.dining",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
          {
            displayName: "Viewer",
            email: "viewer@bella.dining",
            passwordHash: hashPassword("password123"),
            role: "viewer",
            branchIds: [],
          },
        ],
      },
    },
  });

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
        create: [{ moduleId: "accommodation", enabled: true, config: {} }],
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

  const guest = await prisma.customer.create({
    data: {
      tenantId: restaurant.id,
      displayName: "Ada Diner",
      email: "ada@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { restaurant, hotel, guest };
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

async function guestLogin() {
  const token = await mockLifeOs.issueToken({
    sub: "lifeos_diner",
    aud: "exp_bella_restaurant",
    experience_id: "exp_bella_restaurant",
    business_id: "biz_bella_restaurant",
    display_name: "Ada Diner",
    jti: `jti_d5_${Date.now()}`,
  });
  const handoff = `hof_d5_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_bella_restaurant", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_bella_restaurant" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  return exchange.json() as { token: string };
}

async function seedFloor(auth: { token: string }) {
  const area = await app.inject({
    method: "POST",
    url: "/dining/areas",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Main Room", code: `MR-${Date.now()}`, areaType: "indoor" },
  });
  assert.equal(area.statusCode, 200, area.body);
  const table = await app.inject({
    method: "POST",
    url: "/dining/tables",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      diningAreaId: area.json().area.id,
      name: "T1",
      code: `T1-${Date.now()}`,
      capacity: 4,
    },
  });
  assert.equal(table.statusCode, 200, table.body);
  return { area: area.json().area, table: table.json().table };
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

test("module gate: hotel without restaurant cannot access dining APIs", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/dining/tables",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("table management creates bookable resources", async () => {
  const auth = await staffLogin("bella-restaurant", "admin@bella.dining");
  const { table } = await seedFloor(auth);
  assert.ok(table.bookableResourceId);
  const resource = await prisma.bookableResource.findUnique({
    where: { id: table.bookableResourceId },
  });
  assert.ok(resource);
  assert.equal(resource!.moduleId, "restaurant");
  assert.equal(resource!.sourceType, "dining_table");
});

test("reservation lifecycle uses booking engine", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("bella-restaurant", "admin@bella.dining");
  const { table } = await seedFloor(auth);

  const created = await app.inject({
    method: "POST",
    url: "/dining/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      tableId: table.id,
      customerId: seed.guest.id,
      partySize: 2,
      seatingAt: "2026-11-01T19:00:00.000Z",
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  const reservation = created.json().reservation;
  assert.ok(reservation.bookingId);
  assert.equal(reservation.status, "confirmed");

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: reservation.bookingId },
  });
  assert.equal(booking.moduleId, "restaurant");

  const seated = await app.inject({
    method: "POST",
    url: `/dining/reservations/${reservation.id}/seat`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {},
  });
  assert.equal(seated.statusCode, 200, seated.body);

  const afterSeat = await prisma.diningTable.findUniqueOrThrow({ where: { id: table.id } });
  assert.equal(afterSeat.status, "occupied");
});

test("commerce engine integration for menu items", async () => {
  const auth = await staffLogin("bella-restaurant", "admin@bella.dining");
  const menu = await app.inject({
    method: "POST",
    url: "/dining/menus",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Lunch", code: `L-${Date.now()}` },
  });
  assert.equal(menu.statusCode, 200, menu.body);
  const section = await app.inject({
    method: "POST",
    url: `/dining/menus/${menu.json().menu.id}/sections`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Mains", code: "MAINS" },
  });
  assert.equal(section.statusCode, 200, section.body);
  const item = await app.inject({
    method: "POST",
    url: `/dining/sections/${section.json().section.id}/items`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Pasta", code: `P-${Date.now()}`, price: 18, asProduct: true },
  });
  assert.equal(item.statusCode, 200, item.body);
  assert.ok(item.json().item.offeringId);
  const offering = await prisma.offering.findUnique({
    where: { id: item.json().item.offeringId },
  });
  assert.ok(offering);
  assert.equal(offering!.moduleId, "restaurant");
});

test("order lifecycle and kitchen workflow", async () => {
  const auth = await staffLogin("bella-restaurant", "admin@bella.dining");
  const menu = await app.inject({
    method: "POST",
    url: "/dining/menus",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "A la carte", code: `A-${Date.now()}` },
  });
  const section = await app.inject({
    method: "POST",
    url: `/dining/menus/${menu.json().menu.id}/sections`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Plates", code: "PLATES" },
  });
  const item = await app.inject({
    method: "POST",
    url: `/dining/sections/${section.json().section.id}/items`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Soup", code: `S-${Date.now()}`, price: 9 },
  });

  const order = await app.inject({
    method: "POST",
    url: "/dining/orders",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      orderType: "dine_in",
      items: [
        {
          menuItemId: item.json().item.id,
          name: "Soup",
          quantity: 1,
          unitPrice: 9,
        },
      ],
    },
  });
  assert.equal(order.statusCode, 200, order.body);
  const orderId = order.json().order.id as string;

  const submitted = await app.inject({
    method: "POST",
    url: `/dining/orders/${orderId}/transition`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { status: "submitted" },
  });
  assert.equal(submitted.statusCode, 200, submitted.body);

  const tickets = await app.inject({
    method: "GET",
    url: "/dining/kitchen/tickets",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(tickets.statusCode, 200);
  assert.ok(tickets.json().tickets.length >= 1);
  const ticketId = tickets.json().tickets[0].id as string;

  const ready = await app.inject({
    method: "PATCH",
    url: `/dining/kitchen/tickets/${ticketId}`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { status: "ready" },
  });
  assert.equal(ready.statusCode, 200, ready.body);
  assert.equal(ready.json().ticket.status, "ready");
});

test("waitlist when table unavailable", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("bella-restaurant", "admin@bella.dining");
  const area = await app.inject({
    method: "POST",
    url: "/dining/areas",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Intimate", code: `INT-${Date.now()}`, areaType: "indoor" },
  });
  const tableRes = await app.inject({
    method: "POST",
    url: "/dining/tables",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      diningAreaId: area.json().area.id,
      name: "Two-top",
      code: `TT-${Date.now()}`,
      capacity: 1,
    },
  });
  assert.equal(tableRes.statusCode, 200, tableRes.body);
  const table = tableRes.json().table;

  await app.inject({
    method: "POST",
    url: "/dining/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      tableId: table.id,
      customerId: seed.guest.id,
      partySize: 1,
      seatingAt: "2026-11-02T19:00:00.000Z",
      endsAt: "2026-11-02T21:00:00.000Z",
    },
  });

  const guest2 = await prisma.customer.create({
    data: {
      tenantId: seed.restaurant.id,
      displayName: "Bob",
      email: "bob@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const conflict = await app.inject({
    method: "POST",
    url: "/dining/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      tableId: table.id,
      customerId: guest2.id,
      partySize: 1,
      seatingAt: "2026-11-02T19:30:00.000Z",
      endsAt: "2026-11-02T20:30:00.000Z",
      joinWaitlistIfUnavailable: true,
    },
  });
  assert.equal(conflict.statusCode, 409);
  assert.ok(["waitlisted", "capacity_exceeded"].includes(conflict.json().error));
});

test("tenant isolation on dining tables", async () => {
  const bella = await staffLogin("bella-restaurant", "admin@bella.dining");
  const { table } = await seedFloor(bella);
  // Enable restaurant on hotel temporarily — still isolated by tenantId
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "sunrise-hotel" } });
  await prisma.tenantModule.create({
    data: { tenantId: hotel.id, moduleId: "restaurant", enabled: true, config: {} },
  });
  const hotelAuth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/dining/tables",
    headers: { authorization: `Bearer ${hotelAuth.token}` },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(!list.json().tables.some((t: { id: string }) => t.id === table.id));
});

test("API validation rejects invalid reservation", async () => {
  const auth = await staffLogin("bella-restaurant", "admin@bella.dining");
  const res = await app.inject({
    method: "POST",
    url: "/dining/reservations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { partySize: 2 },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});

test("role permissions: viewer cannot create tables", async () => {
  const auth = await staffLogin("bella-restaurant", "viewer@bella.dining");
  const res = await app.inject({
    method: "POST",
    url: "/dining/areas",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "X", code: "X" },
  });
  assert.equal(res.statusCode, 403);
});

test("guest can browse menus and reserve", async () => {
  const auth = await staffLogin("bella-restaurant", "admin@bella.dining");
  const { area, table } = await seedFloor(auth);
  const menu = await app.inject({
    method: "POST",
    url: "/dining/menus",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Guest Menu", code: `G-${Date.now()}`, featured: true },
  });
  const section = await app.inject({
    method: "POST",
    url: `/dining/menus/${menu.json().menu.id}/sections`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Starters", code: "START" },
  });
  await app.inject({
    method: "POST",
    url: `/dining/sections/${section.json().section.id}/items`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Bread", code: `B-${Date.now()}`, price: 5, featured: true },
  });

  const guest = await guestLogin();
  const menus = await app.inject({
    method: "GET",
    url: "/guest/dining/menus",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(menus.statusCode, 200);
  assert.ok(menus.json().menus.length >= 1);

  const reserved = await app.inject({
    method: "POST",
    url: "/guest/dining/reservations",
    headers: { authorization: `Bearer ${guest.token}` },
    payload: {
      diningAreaId: area.id,
      tableId: table.id,
      partySize: 2,
      seatingAt: "2026-12-01T18:00:00.000Z",
    },
  });
  assert.equal(reserved.statusCode, 200, reserved.body);
});
