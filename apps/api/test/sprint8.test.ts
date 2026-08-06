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
import { bookEventTicket } from "../src/services/events.js";

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

function futureIso(daysAhead: number, hour = 10) {
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

  const centre = await prisma.tenant.create({
    data: {
      slug: "royal-event-centre",
      name: "Royal Event Centre",
      businessType: "event_centre",
      experienceId: "exp_royal_events",
      lifeosBusinessId: "biz_royal_events",
      primaryColor: "#B45309",
      secondaryColor: "#78350F",
      accentColor: "#FDE68A",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "events", enabled: true, config: {} },
          { moduleId: "ticketing", enabled: true, config: {} },
          { moduleId: "venue_booking", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Events Admin",
            email: "events@royal.centre",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
          {
            displayName: "Check-in",
            email: "checkin@royal.centre",
            passwordHash: hashPassword("password123"),
            role: "checkin_staff",
            branchIds: [],
          },
          {
            displayName: "Viewer",
            email: "viewer@royal.centre",
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
      tenantId: centre.id,
      displayName: "Eve Guest",
      email: "eve@example.com",
      lifeosUserId: "lifeos_eve",
      trustId: "trust_eve",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const guest2 = await prisma.customer.create({
    data: {
      tenantId: centre.id,
      displayName: "Sam Second",
      email: "sam@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { centre, guest, guest2 };
}

async function fixtures() {
  const centre = await prisma.tenant.findUniqueOrThrow({ where: { slug: "royal-event-centre" } });
  const guest = await prisma.customer.findFirstOrThrow({
    where: { tenantId: centre.id, email: "eve@example.com" },
  });
  const guest2 = await prisma.customer.findFirstOrThrow({
    where: { tenantId: centre.id, email: "sam@example.com" },
  });
  return { centre, guest, guest2 };
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
    sub: "lifeos_eve",
    aud: "exp_royal_events",
    experience_id: "exp_royal_events",
    business_id: "biz_royal_events",
    display_name: "Eve Guest",
    jti: `jti_d8_${Date.now()}`,
  });
  const handoff = `hof_d8_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_royal_events", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_royal_events" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  const body = exchange.json() as { token: string; customer: { id: string } };
  return { token: body.token, customerId: body.customer.id };
}

async function seedOpenEvent(auth: { token: string }, opts?: { capacity?: number; seating?: boolean }) {
  const venue = await app.inject({
    method: "POST",
    url: "/venues",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Grand Hall",
      code: `GH-${Date.now()}`,
      capacity: 200,
      venueType: "ballroom",
    },
  });
  assert.equal(venue.statusCode, 200, venue.body);
  const startsAt = futureIso(10, 9);
  const endsAt = futureIso(10, 17);
  const event = await app.inject({
    method: "POST",
    url: "/events",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Summit",
      code: `EV-${Date.now()}`,
      venueId: venue.json().venue.id,
      startsAt,
      endsAt,
      capacity: opts?.capacity ?? 50,
      seatingMode: opts?.seating ? "assigned" : "general_admission",
    },
  });
  assert.equal(event.statusCode, 200, event.body);
  const publish = await app.inject({
    method: "POST",
    url: `/events/${event.json().event.id}/publish`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(publish.statusCode, 200, publish.body);
  const ticketType = await app.inject({
    method: "POST",
    url: "/tickets/types",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventId: event.json().event.id,
      name: "GA",
      code: `GA-${Date.now()}`,
      price: 49,
      capacity: opts?.capacity ?? 50,
    },
  });
  assert.equal(ticketType.statusCode, 200, ticketType.body);
  return {
    venue: venue.json().venue,
    event: publish.json().event,
    ticketType: ticketType.json().ticketType,
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

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  if (app) await app.close();
  if (mockLifeOs) await mockLifeOs.close();
  await prisma.$disconnect();
});

test("module gate: hotel without events cannot access events APIs", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/events/dashboard",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("venue management creates Booking Engine resource", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const venue = await app.inject({
    method: "POST",
    url: "/venues",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Ballroom", code: `B-${Date.now()}`, capacity: 150 },
  });
  assert.equal(venue.statusCode, 200, venue.body);
  assert.ok(venue.json().venue.bookableResourceId);
  const resource = await prisma.bookableResource.findUnique({
    where: { id: venue.json().venue.bookableResourceId },
  });
  assert.equal(resource!.sourceType, "event_venue");
  assert.equal(resource!.moduleId, "venue_booking");
});

test("event lifecycle publish and sessions", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const { event } = await seedOpenEvent(auth);
  assert.equal(event.status, "open");
  const session = await app.inject({
    method: "POST",
    url: `/events/${event.id}/sessions`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Morning",
      code: `AM-${Date.now()}`,
      startsAt: futureIso(10, 9),
      endsAt: futureIso(10, 12),
      capacity: 50,
    },
  });
  assert.equal(session.statusCode, 200, session.body);
  assert.ok(session.json().session.bookableResourceId);
});

test("ticket types use Commerce Engine", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const { ticketType } = await seedOpenEvent(auth);
  assert.ok(ticketType.offeringId);
  const offering = await prisma.offering.findUnique({ where: { id: ticketType.offeringId } });
  assert.equal(offering!.moduleId, "ticketing");
});

test("ticket booking and capacity enforcement", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const ctx = await fixtures();
  const { event, ticketType } = await seedOpenEvent(auth, { capacity: 2 });
  const first = await app.inject({
    method: "POST",
    url: "/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventId: event.id,
      ticketTypeId: ticketType.id,
      customerId: ctx.guest.id,
      holderName: "Eve",
    },
  });
  assert.equal(first.statusCode, 200, first.body);
  const second = await app.inject({
    method: "POST",
    url: "/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventId: event.id,
      ticketTypeId: ticketType.id,
      customerId: ctx.guest2.id,
      holderName: "Sam",
    },
  });
  assert.equal(second.statusCode, 200, second.body);
  const third = await app.inject({
    method: "POST",
    url: "/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventId: event.id,
      ticketTypeId: ticketType.id,
      holderName: "Overflow",
      joinWaitlistIfUnavailable: false,
    },
  });
  assert.equal(third.statusCode, 409);
  assert.equal(third.json().error, "sold_out");
});

test("concurrent last-ticket race allows only one winner", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const ctx = await fixtures();
  const { event, ticketType } = await seedOpenEvent(auth, { capacity: 1 });

  const results = await Promise.allSettled([
    bookEventTicket({
      tenantId: ctx.centre.id,
      eventId: event.id,
      ticketTypeId: ticketType.id,
      customerId: ctx.guest.id,
      holderName: "A",
      actorKind: "staff",
    }),
    bookEventTicket({
      tenantId: ctx.centre.id,
      eventId: event.id,
      ticketTypeId: ticketType.id,
      customerId: ctx.guest2.id,
      holderName: "B",
      actorKind: "staff",
    }),
  ]);

  const wins = results.filter((r) => r.status === "fulfilled");
  const losses = results.filter((r) => r.status === "rejected");
  assert.equal(wins.length, 1);
  assert.equal(losses.length, 1);
  const sold = await prisma.eventTicketType.findUnique({ where: { id: ticketType.id } });
  assert.equal(sold!.soldCount, 1);
});

test("assigned seating and concurrent seat race", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const ctx = await fixtures();
  const { event, ticketType } = await seedOpenEvent(auth, { capacity: 5, seating: true });
  const plan = await app.inject({
    method: "POST",
    url: "/seating/plans",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventId: event.id,
      name: "Main",
      sections: [{ name: "VIP", code: "VIP", seats: [{ label: "A1" }] }],
    },
  });
  assert.equal(plan.statusCode, 200, plan.body);
  const seatId = plan.json().plan.sections[0].seats[0].id;

  const results = await Promise.allSettled([
    bookEventTicket({
      tenantId: ctx.centre.id,
      eventId: event.id,
      ticketTypeId: ticketType.id,
      seatId,
      customerId: ctx.guest.id,
      holderName: "A",
      actorKind: "staff",
    }),
    bookEventTicket({
      tenantId: ctx.centre.id,
      eventId: event.id,
      ticketTypeId: ticketType.id,
      seatId,
      customerId: ctx.guest2.id,
      holderName: "B",
      actorKind: "staff",
    }),
  ]);
  const wins = results.filter((r) => r.status === "fulfilled");
  assert.equal(wins.length, 1);
  const seat = await prisma.seat.findUnique({ where: { id: seatId } });
  assert.equal(seat!.status, "sold");
});

test("waitlist when sold out", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const ctx = await fixtures();
  const { event, ticketType } = await seedOpenEvent(auth, { capacity: 1 });
  await app.inject({
    method: "POST",
    url: "/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { eventId: event.id, ticketTypeId: ticketType.id, customerId: ctx.guest.id },
  });
  const wait = await app.inject({
    method: "POST",
    url: "/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventId: event.id,
      ticketTypeId: ticketType.id,
      customerId: ctx.guest2.id,
      joinWaitlistIfUnavailable: true,
    },
  });
  assert.equal(wait.statusCode, 409);
  assert.equal(wait.json().error, "waitlisted");
  assert.ok(wait.json().waitlistEntry);
});

test("venue rental uses Booking Engine", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const ctx = await fixtures();
  const venue = await app.inject({
    method: "POST",
    url: "/venues",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Garden", code: `G-${Date.now()}`, capacity: 80 },
  });
  const rental = await app.inject({
    method: "POST",
    url: "/venues/rentals",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      venueId: venue.json().venue.id,
      customerId: ctx.guest.id,
      startsAt: futureIso(12, 10),
      endsAt: futureIso(12, 14),
      partySize: 40,
    },
  });
  assert.equal(rental.statusCode, 200, rental.body);
  assert.ok(rental.json().booking.id);
});

test("packages and add-ons use Commerce", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const pkg = await app.inject({
    method: "POST",
    url: "/events/packages",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Wedding Package", code: `WP-${Date.now()}`, price: 5000 },
  });
  assert.equal(pkg.statusCode, 200, pkg.body);
  assert.ok(pkg.json().package.offeringId);
  const addon = await app.inject({
    method: "POST",
    url: "/events/addons",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Lighting", code: `L-${Date.now()}`, price: 400 },
  });
  assert.equal(addon.statusCode, 200, addon.body);
  assert.ok(addon.json().addon.offeringId);
});

test("guest booking and TrustID attendee mapping", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const guest = await guestLogin();
  const { event, ticketType } = await seedOpenEvent(auth);
  const book = await app.inject({
    method: "POST",
    url: "/guest/tickets",
    headers: { authorization: `Bearer ${guest.token}` },
    payload: { eventId: event.id, ticketTypeId: ticketType.id },
  });
  assert.equal(book.statusCode, 200, book.body);
  assert.equal(book.json().ticket.customerId, guest.customerId);
  const attendee = await prisma.eventAttendee.findFirst({
    where: { ticketId: book.json().ticket.id },
  });
  assert.ok(attendee);
  assert.equal(attendee!.customerId, guest.customerId);
  const customer = await prisma.customer.findUnique({ where: { id: guest.customerId } });
  assert.equal(customer!.lifeosUserId, "lifeos_eve");
});

test("check-in and role permissions", async () => {
  const auth = await staffLogin("royal-event-centre", "events@royal.centre");
  const checkin = await staffLogin("royal-event-centre", "checkin@royal.centre");
  const viewer = await staffLogin("royal-event-centre", "viewer@royal.centre");
  const ctx = await fixtures();
  const { event, ticketType } = await seedOpenEvent(auth);
  const book = await app.inject({
    method: "POST",
    url: "/tickets/book",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventId: event.id,
      ticketTypeId: ticketType.id,
      customerId: ctx.guest.id,
      holderName: "Eve",
    },
  });
  const denied = await app.inject({
    method: "POST",
    url: "/venues",
    headers: { authorization: `Bearer ${viewer.token}` },
    payload: { name: "X", code: `X-${Date.now()}` },
  });
  assert.equal(denied.statusCode, 403);

  const ok = await app.inject({
    method: "POST",
    url: "/check-in",
    headers: { authorization: `Bearer ${checkin.token}` },
    payload: { ticketId: book.json().ticket.id },
  });
  assert.equal(ok.statusCode, 200, ok.body);
});
