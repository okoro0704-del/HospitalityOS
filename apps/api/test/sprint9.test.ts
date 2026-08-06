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
import {
  bookCinemaTicket,
  holdSeat,
  releaseExpiredHolds,
} from "../src/services/cinema.js";

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

function futureIso(daysAhead: number, hour = 19) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

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

  const cinema = await prisma.tenant.create({
    data: {
      slug: "city-cinema",
      name: "City Cinema",
      businessType: "cinema",
      experienceId: "exp_city_cinema",
      lifeosBusinessId: "biz_city_cinema",
      primaryColor: "#111827",
      secondaryColor: "#374151",
      accentColor: "#F97316",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "cinema", enabled: true, config: {} },
          { moduleId: "ticketing", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Box Admin",
            email: "box@city.cinema",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
          {
            displayName: "Check-in",
            email: "checkin@city.cinema",
            passwordHash: hashPassword("password123"),
            role: "checkin_staff",
            branchIds: [],
          },
          {
            displayName: "Viewer",
            email: "viewer@city.cinema",
            passwordHash: hashPassword("password123"),
            role: "viewer",
            branchIds: [],
          },
        ],
      },
    },
  });

  await prisma.tenant.create({
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
      tenantId: cinema.id,
      displayName: "Mia Moviegoer",
      email: "mia@example.com",
      lifeosUserId: "lifeos_mia",
      trustId: "trust_mia",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const guest2 = await prisma.customer.create({
    data: {
      tenantId: cinema.id,
      displayName: "Leo Late",
      email: "leo@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { cinema, guest, guest2 };
}

async function fixtures() {
  const cinema = await prisma.tenant.findUniqueOrThrow({ where: { slug: "city-cinema" } });
  const guest = await prisma.customer.findFirstOrThrow({
    where: { tenantId: cinema.id, email: "mia@example.com" },
  });
  const guest2 = await prisma.customer.findFirstOrThrow({
    where: { tenantId: cinema.id, email: "leo@example.com" },
  });
  return { cinema, guest, guest2 };
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
    sub: "lifeos_mia",
    aud: "exp_city_cinema",
    experience_id: "exp_city_cinema",
    business_id: "biz_city_cinema",
    display_name: "Mia Moviegoer",
    jti: `jti_d9_${Date.now()}`,
  });
  const handoff = `hof_d9_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_city_cinema", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_city_cinema" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  const body = exchange.json() as { token: string; customer: { id: string } };
  return { token: body.token, customerId: body.customer.id };
}

async function seedOnSaleShow(
  auth: { token: string },
  opts?: { capacity?: number; seating?: boolean; dayOffset?: number },
) {
  const day = opts?.dayOffset ?? 12;
  const venue = await app.inject({
    method: "POST",
    url: "/cinema/venues",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Main Complex", code: `VN-${Date.now()}` },
  });
  assert.equal(venue.statusCode, 201, venue.body);

  const screen = await app.inject({
    method: "POST",
    url: "/cinema/screens",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      venueId: venue.json().venue.id,
      name: "Screen A",
      code: `SCR-${Date.now()}`,
      capacity: opts?.capacity ?? 40,
      seatingMode: opts?.seating === false ? "general_admission" : "assigned",
    },
  });
  assert.equal(screen.statusCode, 201, screen.body);

  let seats: Array<{ id: string; label: string }> = [];
  if (opts?.seating !== false) {
    const map = await app.inject({
      method: "POST",
      url: "/cinema/seats/maps",
      headers: { authorization: `Bearer ${auth.token}` },
      payload: {
        screenId: screen.json().screen.id,
        name: "Map",
        sections: [
          {
            name: "Main",
            code: "MAIN",
            seats: [
              { label: "A1", rowLabel: "A" },
              { label: "A2", rowLabel: "A" },
              { label: "A3", rowLabel: "A" },
            ],
          },
        ],
      },
    });
    assert.equal(map.statusCode, 201, map.body);
    seats = map.json().seatMap.sections[0].seats;
  }

  const content = await app.inject({
    method: "POST",
    url: "/cinema/content",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      title: "Test Film",
      code: `FILM-${Date.now()}`,
      runtimeMinutes: 100,
      rating: "PG",
    },
  });
  assert.equal(content.statusCode, 201, content.body);

  const startsAt = futureIso(day, 19);
  const endsAt = futureIso(day, 21);
  const showtime = await app.inject({
    method: "POST",
    url: "/cinema/showtimes",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      contentId: content.json().content.id,
      screenId: screen.json().screen.id,
      startsAt,
      endsAt,
      capacity: opts?.capacity ?? 40,
      seatingMode: opts?.seating === false ? "general_admission" : "assigned",
    },
  });
  assert.equal(showtime.statusCode, 201, showtime.body);

  const open = await app.inject({
    method: "POST",
    url: `/cinema/showtimes/${showtime.json().showtime.id}/open`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(open.statusCode, 200, open.body);

  const ticketType = await app.inject({
    method: "POST",
    url: "/cinema/tickets/types",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      showtimeId: showtime.json().showtime.id,
      name: "GA",
      code: `GA-${Date.now()}`,
      price: 12,
      capacity: opts?.capacity ?? 40,
    },
  });
  assert.equal(ticketType.statusCode, 201, ticketType.body);

  return {
    venue: venue.json().venue,
    screen: screen.json().screen,
    content: content.json().content,
    showtime: open.json().showtime,
    ticketType: ticketType.json().ticketType,
    seats,
  };
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

after(async () => {
  await app.close();
  await mockLifeOs.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

test("module gate: hotel without cinema cannot access cinema APIs", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/cinema/venues",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("screen management creates Booking Engine resource", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const seeded = await seedOnSaleShow(auth, { capacity: 10, dayOffset: 20 });
  assert.ok(seeded.screen.bookableResourceId);
  const resource = await prisma.bookableResource.findUniqueOrThrow({
    where: { id: seeded.screen.bookableResourceId },
  });
  assert.equal(resource.sourceType, "cinema_screen");
  assert.equal(resource.moduleId, "cinema");
});

test("content management and showtime lifecycle", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const seeded = await seedOnSaleShow(auth, { seating: false, capacity: 20, dayOffset: 21 });
  assert.equal(seeded.showtime.status, "on_sale");
  assert.ok(seeded.showtime.bookingId);
  assert.equal(seeded.content.title, "Test Film");
});

test("ticket types use Commerce Engine", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const seeded = await seedOnSaleShow(auth, { seating: false, dayOffset: 22 });
  assert.ok(seeded.ticketType.offeringId);
  const offering = await prisma.offering.findUniqueOrThrow({
    where: { id: seeded.ticketType.offeringId },
    include: { productDetail: true },
  });
  assert.equal(offering.moduleId, "cinema");
  assert.equal(offering.productDetail?.unit, "ticket");
});

test("general admission ticket booking and capacity enforcement", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const { guest, guest2 } = await fixtures();
  const seeded = await seedOnSaleShow(auth, { seating: false, capacity: 2, dayOffset: 23 });

  const t1 = await app.inject({
    method: "POST",
    url: "/cinema/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
      customerId: guest.id,
    },
  });
  assert.equal(t1.statusCode, 201, t1.body);

  const t2 = await app.inject({
    method: "POST",
    url: "/cinema/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
      customerId: guest2.id,
    },
  });
  assert.equal(t2.statusCode, 201, t2.body);

  const t3 = await app.inject({
    method: "POST",
    url: "/cinema/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
      holderName: "Overflow",
    },
  });
  assert.equal(t3.statusCode, 409);
  assert.equal(t3.json().error, "sold_out");
});

test("concurrent last-ticket race allows only one winner", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const { cinema, guest, guest2 } = await fixtures();
  const seeded = await seedOnSaleShow(auth, { seating: false, capacity: 1, dayOffset: 24 });

  const results = await Promise.allSettled([
    bookCinemaTicket({
      tenantId: cinema.id,
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
      customerId: guest.id,
      actorKind: "system",
    }),
    bookCinemaTicket({
      tenantId: cinema.id,
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
      customerId: guest2.id,
      actorKind: "system",
    }),
  ]);
  const wins = results.filter((r) => r.status === "fulfilled");
  const losses = results.filter((r) => r.status === "rejected");
  assert.equal(wins.length, 1);
  assert.equal(losses.length, 1);
});

test("assigned seating and concurrent seat race", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const { cinema, guest, guest2 } = await fixtures();
  const seeded = await seedOnSaleShow(auth, { seating: true, capacity: 10, dayOffset: 25 });
  const seatId = seeded.seats[0].id;

  const results = await Promise.allSettled([
    bookCinemaTicket({
      tenantId: cinema.id,
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
      customerId: guest.id,
      seatId,
      actorKind: "system",
    }),
    bookCinemaTicket({
      tenantId: cinema.id,
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
      customerId: guest2.id,
      seatId,
      actorKind: "system",
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});

test("seat holds and expiration release seats", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const { cinema, guest } = await fixtures();
  const seeded = await seedOnSaleShow(auth, { seating: true, dayOffset: 26 });
  const seatId = seeded.seats[1].id;

  const hold = await holdSeat({
    tenantId: cinema.id,
    showtimeId: seeded.showtime.id,
    seatId,
    sessionKey: "sess-hold-1",
    customerId: guest.id,
    holdMinutes: 30,
    actorKind: "system",
  });
  assert.equal(hold.status, "active");

  const seat = await prisma.cinemaSeat.findUniqueOrThrow({ where: { id: seatId } });
  assert.equal(seat.status, "held");

  await prisma.cinemaSeatHold.update({
    where: { id: hold.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const released = await releaseExpiredHolds(cinema.id);
  assert.ok(released >= 1);

  const after = await prisma.cinemaSeat.findUniqueOrThrow({ where: { id: seatId } });
  assert.equal(after.status, "available");
});

test("hold converts on booking; duplicate hold prevented", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const { cinema, guest } = await fixtures();
  const seeded = await seedOnSaleShow(auth, { seating: true, dayOffset: 27 });
  const seatId = seeded.seats[2].id;

  await holdSeat({
    tenantId: cinema.id,
    showtimeId: seeded.showtime.id,
    seatId,
    sessionKey: "sess-a",
    actorKind: "system",
  });

  await assert.rejects(
    () =>
      holdSeat({
        tenantId: cinema.id,
        showtimeId: seeded.showtime.id,
        seatId,
        sessionKey: "sess-b",
        actorKind: "system",
      }),
    (err: Error & { code?: string }) => err.code === "seat_unavailable",
  );

  const ticket = await bookCinemaTicket({
    tenantId: cinema.id,
    showtimeId: seeded.showtime.id,
    ticketTypeId: seeded.ticketType.id,
    customerId: guest.id,
    seatId,
    sessionKey: "sess-a",
    actorKind: "system",
  });
  assert.equal(ticket.seatId, seatId);
});

test("concessions use Commerce and orders workflow", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const seeded = await seedOnSaleShow(auth, { seating: false, dayOffset: 28 });
  const concession = await app.inject({
    method: "POST",
    url: "/cinema/concessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      venueId: seeded.venue.id,
      name: "Popcorn",
      code: `POP-${Date.now()}`,
      price: 5,
      category: "snack",
    },
  });
  assert.equal(concession.statusCode, 201, concession.body);
  assert.ok(concession.json().concession.offeringId);

  const order = await app.inject({
    method: "POST",
    url: "/cinema/orders",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      venueId: seeded.venue.id,
      items: [{ concessionId: concession.json().concession.id, quantity: 2 }],
    },
  });
  assert.equal(order.statusCode, 201, order.body);
  assert.equal(order.json().order.status, "submitted");
  assert.equal(order.json().order.totalAmount, 10);

  const ready = await app.inject({
    method: "PATCH",
    url: `/cinema/orders/${order.json().order.id}/status`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { status: "ready" },
  });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().order.status, "ready");
});

test("guest booking and TrustID attendee mapping", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const seeded = await seedOnSaleShow(auth, { seating: false, dayOffset: 29 });
  const guest = await guestLogin();

  const book = await app.inject({
    method: "POST",
    url: "/guest/cinema/tickets",
    headers: { authorization: `Bearer ${guest.token}` },
    payload: {
      showtimeId: seeded.showtime.id,
      ticketTypeId: seeded.ticketType.id,
    },
  });
  assert.equal(book.statusCode, 201, book.body);
  const attendee = await prisma.cinemaAttendee.findFirstOrThrow({
    where: { ticketId: book.json().ticket.id },
  });
  assert.equal(attendee.customerId, guest.customerId);

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: guest.customerId } });
  assert.equal(customer.lifeosUserId, "lifeos_mia");
  assert.equal(customer.trustId, "trust_mia");
});

test("check-in and role permissions", async () => {
  const auth = await staffLogin("city-cinema", "box@city.cinema");
  const { guest } = await fixtures();
  const seeded = await seedOnSaleShow(auth, { seating: false, dayOffset: 30 });
  const ticket = await bookCinemaTicket({
    tenantId: (await fixtures()).cinema.id,
    showtimeId: seeded.showtime.id,
    ticketTypeId: seeded.ticketType.id,
    customerId: guest.id,
    actorKind: "system",
  });

  const checkinAuth = await staffLogin("city-cinema", "checkin@city.cinema");
  const checkIn = await app.inject({
    method: "POST",
    url: "/cinema/check-in",
    headers: { authorization: `Bearer ${checkinAuth.token}` },
    payload: { ticketId: ticket.id },
  });
  assert.equal(checkIn.statusCode, 201, checkIn.body);

  const viewer = await staffLogin("city-cinema", "viewer@city.cinema");
  const denied = await app.inject({
    method: "POST",
    url: "/cinema/venues",
    headers: { authorization: `Bearer ${viewer.token}` },
    payload: { name: "X", code: "X" },
  });
  assert.equal(denied.statusCode, 403);
});
