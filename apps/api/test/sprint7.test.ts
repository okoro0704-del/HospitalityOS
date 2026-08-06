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

  const spa = await prisma.tenant.create({
    data: {
      slug: "serenity-spa",
      name: "Serenity Spa",
      businessType: "spa",
      experienceId: "exp_serenity_spa",
      lifeosBusinessId: "biz_serenity_spa",
      primaryColor: "#6D28D9",
      secondaryColor: "#4C1D95",
      accentColor: "#C4B5FD",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "spa_services", enabled: true, config: {} },
          { moduleId: "beauty_appointments", enabled: true, config: {} },
          { moduleId: "wellness_packages", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Spa Admin",
            email: "care@serenity.spa",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
          {
            displayName: "Reception",
            email: "desk@serenity.spa",
            passwordHash: hashPassword("password123"),
            role: "reception",
            branchIds: [],
          },
          {
            displayName: "Therapist",
            email: "therapist@serenity.spa",
            passwordHash: hashPassword("password123"),
            role: "spa_therapist",
            branchIds: [],
          },
          {
            displayName: "Viewer",
            email: "viewer@serenity.spa",
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
      tenantId: spa.id,
      displayName: "Nora Guest",
      email: "nora@example.com",
      lifeosUserId: "lifeos_nora",
      trustId: "trust_nora",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const guest2 = await prisma.customer.create({
    data: {
      tenantId: spa.id,
      displayName: "Sam Second",
      email: "sam@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { spa, hotel, guest, guest2 };
}

async function fixtures() {
  const spa = await prisma.tenant.findUniqueOrThrow({ where: { slug: "serenity-spa" } });
  const guest = await prisma.customer.findFirstOrThrow({
    where: { tenantId: spa.id, email: "nora@example.com" },
  });
  const guest2 = await prisma.customer.findFirstOrThrow({
    where: { tenantId: spa.id, email: "sam@example.com" },
  });
  return { spa, guest, guest2 };
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
    sub: "lifeos_nora",
    aud: "exp_serenity_spa",
    experience_id: "exp_serenity_spa",
    business_id: "biz_serenity_spa",
    display_name: "Nora Guest",
    jti: `jti_d7_${Date.now()}`,
  });
  const handoff = `hof_d7_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_serenity_spa", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_serenity_spa" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  const body = exchange.json() as { token: string; customer: { id: string } };
  return { token: body.token, customerId: body.customer.id };
}

async function seedSpaFloor(auth: { token: string }) {
  const facility = await app.inject({
    method: "POST",
    url: "/spa/facilities",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Main Spa", code: `SPA-${Date.now()}` },
  });
  assert.equal(facility.statusCode, 200, facility.body);
  const room = await app.inject({
    method: "POST",
    url: `/spa/facilities/${facility.json().facility.id}/rooms`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Massage 1", code: `R-${Date.now()}`, roomType: "massage", capacity: 1 },
  });
  assert.equal(room.statusCode, 200, room.body);
  const area = await app.inject({
    method: "POST",
    url: `/spa/facilities/${facility.json().facility.id}/areas`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Sauna", code: `SA-${Date.now()}`, areaType: "sauna", capacity: 6 },
  });
  assert.equal(area.statusCode, 200, area.body);
  return {
    facility: facility.json().facility,
    room: room.json().room,
    area: area.json().area,
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

test("module gate: hotel without spa cannot access spa APIs", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/spa/dashboard",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("treatment CRUD uses Commerce Engine", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const treatment = await app.inject({
    method: "POST",
    url: "/spa/treatments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Swedish Massage",
      code: `SW-${Date.now()}`,
      durationMinutes: 60,
      price: 90,
      requiredRoomTypes: ["massage"],
      requiredSpecialties: ["massage"],
    },
  });
  assert.equal(treatment.statusCode, 200, treatment.body);
  assert.ok(treatment.json().treatment.offeringId);
  const offering = await prisma.offering.findUnique({
    where: { id: treatment.json().treatment.offeringId },
  });
  assert.equal(offering!.moduleId, "spa_services");
  assert.equal(offering!.kind, "service");
});

test("treatment variants create commerce offerings", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const treatment = await app.inject({
    method: "POST",
    url: "/spa/treatments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Facial", code: `F-${Date.now()}`, durationMinutes: 45, price: 70 },
  });
  const variant = await app.inject({
    method: "POST",
    url: `/spa/treatments/${treatment.json().treatment.id}/variants`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "90 minutes", code: "90", durationMinutes: 90, price: 110 },
  });
  assert.equal(variant.statusCode, 200, variant.body);
  assert.ok(variant.json().variant.offeringId);
});

test("therapist and room become bookable resources", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const { room } = await seedSpaFloor(auth);
  assert.ok(room.bookableResourceId);
  const therapist = await app.inject({
    method: "POST",
    url: "/spa/therapists",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      displayName: "Maya",
      specialties: [{ name: "Massage", code: "massage" }],
    },
  });
  assert.equal(therapist.statusCode, 200, therapist.body);
  assert.ok(therapist.json().therapist.bookableResourceId);
});

test("appointment lifecycle via Booking Engine", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const ctx = await fixtures();
  const { room } = await seedSpaFloor(auth);
  const treatment = await app.inject({
    method: "POST",
    url: "/spa/treatments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Deep Tissue",
      code: `DT-${Date.now()}`,
      durationMinutes: 60,
      price: 100,
      requiredRoomTypes: ["massage"],
    },
  });
  const therapist = await app.inject({
    method: "POST",
    url: "/spa/therapists",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      displayName: "Alex",
      specialties: [{ name: "Massage", code: "massage" }],
    },
  });
  const book = await app.inject({
    method: "POST",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      customerId: ctx.guest.id,
      treatmentId: treatment.json().treatment.id,
      therapistId: therapist.json().therapist.id,
      roomId: room.id,
      startsAt: futureIso(4, 11),
    },
  });
  assert.equal(book.statusCode, 200, book.body);
  assert.ok(book.json().booking.id);
  assert.equal(book.json().appointment.status, "confirmed");

  const cancel = await app.inject({
    method: "POST",
    url: `/spa/appointments/${book.json().appointment.id}/cancel`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(cancel.statusCode, 200, cancel.body);
  assert.equal(cancel.json().appointment.status, "cancelled");
});

test("double-booking prevention for therapist", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const ctx = await fixtures();
  const treatment = await app.inject({
    method: "POST",
    url: "/spa/treatments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Hot Stone", code: `HS-${Date.now()}`, durationMinutes: 60, price: 120 },
  });
  const therapist = await app.inject({
    method: "POST",
    url: "/spa/therapists",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { displayName: "Blair", specialties: [{ name: "Massage", code: "massage" }] },
  });
  const startsAt = futureIso(5, 14);
  const first = await app.inject({
    method: "POST",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      customerId: ctx.guest.id,
      treatmentId: treatment.json().treatment.id,
      therapistId: therapist.json().therapist.id,
      startsAt,
      joinWaitlistIfUnavailable: false,
    },
  });
  assert.equal(first.statusCode, 200, first.body);
  const second = await app.inject({
    method: "POST",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      customerId: ctx.guest2.id,
      treatmentId: treatment.json().treatment.id,
      therapistId: therapist.json().therapist.id,
      startsAt,
      joinWaitlistIfUnavailable: true,
    },
  });
  assert.ok(second.statusCode >= 400, second.body);
});

test("room incompatibility and specialty conflicts", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const ctx = await fixtures();
  const { room } = await seedSpaFloor(auth);
  const facialRoom = await app.inject({
    method: "POST",
    url: `/spa/facilities/${(await prisma.spaFacility.findFirstOrThrow({ where: { tenantId: ctx.spa.id } })).id}/rooms`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Facial", code: `FAC-${Date.now()}`, roomType: "facial" },
  });
  const treatment = await app.inject({
    method: "POST",
    url: "/spa/treatments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Massage Only",
      code: `MO-${Date.now()}`,
      requiredRoomTypes: ["massage"],
      requiredSpecialties: ["massage"],
    },
  });
  const badRoom = await app.inject({
    method: "POST",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      customerId: ctx.guest.id,
      treatmentId: treatment.json().treatment.id,
      roomId: facialRoom.json().room.id,
      startsAt: futureIso(6, 10),
    },
  });
  assert.equal(badRoom.statusCode, 409);
  assert.equal(badRoom.json().error, "room_incompatible");

  const therapist = await app.inject({
    method: "POST",
    url: "/spa/therapists",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { displayName: "Facialist", specialties: [{ name: "Facial", code: "facial" }] },
  });
  const badSpec = await app.inject({
    method: "POST",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      customerId: ctx.guest.id,
      treatmentId: treatment.json().treatment.id,
      therapistId: therapist.json().therapist.id,
      roomId: room.id,
      startsAt: futureIso(6, 12),
    },
  });
  assert.equal(badSpec.statusCode, 409);
  assert.equal(badSpec.json().error, "specialty_conflict");
});

test("packages and memberships use Commerce", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const ctx = await fixtures();
  const pkg = await app.inject({
    method: "POST",
    url: "/spa/packages",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Relax Bundle", code: `RB-${Date.now()}`, price: 160 },
  });
  assert.equal(pkg.statusCode, 200, pkg.body);
  assert.ok(pkg.json().package.offeringId);

  const plan = await app.inject({
    method: "POST",
    url: "/spa/memberships/plans",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Spa Monthly", code: `SM-${Date.now()}`, durationDays: 30, price: 120 },
  });
  assert.equal(plan.statusCode, 200, plan.body);
  const mem = await app.inject({
    method: "POST",
    url: "/spa/memberships",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { planId: plan.json().plan.id, customerId: ctx.guest.id },
  });
  assert.equal(mem.statusCode, 200, mem.body);
  assert.equal(mem.json().membership.status, "active");
});

test("wellness facility reservation uses Booking Engine", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const ctx = await fixtures();
  const { area } = await seedSpaFloor(auth);
  const startsAt = futureIso(3, 9);
  const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60000).toISOString();
  const session = await app.inject({
    method: "POST",
    url: "/spa/facilities/sessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      areaId: area.id,
      customerId: ctx.guest.id,
      startsAt,
      endsAt,
      partySize: 1,
    },
  });
  assert.equal(session.statusCode, 200, session.body);
  assert.ok(session.json().booking.id);
});

test("guest booking and client TrustID mapping", async () => {
  const auth = await staffLogin("serenity-spa", "care@serenity.spa");
  const guest = await guestLogin();
  const treatment = await app.inject({
    method: "POST",
    url: "/spa/treatments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Express Facial", code: `EF-${Date.now()}`, durationMinutes: 30, price: 55 },
  });
  const book = await app.inject({
    method: "POST",
    url: "/guest/spa/appointments",
    headers: { authorization: `Bearer ${guest.token}` },
    payload: {
      treatmentId: treatment.json().treatment.id,
      startsAt: futureIso(7, 15),
    },
  });
  assert.equal(book.statusCode, 200, book.body);
  const profile = await prisma.spaClientProfile.findUnique({
    where: {
      tenantId_customerId: {
        tenantId: book.json().appointment.tenantId,
        customerId: guest.customerId,
      },
    },
  });
  assert.ok(profile);
  const customer = await prisma.customer.findUnique({ where: { id: guest.customerId } });
  assert.equal(customer!.lifeosUserId, "lifeos_nora");
});

test("sensitive notes role permissions", async () => {
  const admin = await staffLogin("serenity-spa", "care@serenity.spa");
  const reception = await staffLogin("serenity-spa", "desk@serenity.spa");
  const therapist = await staffLogin("serenity-spa", "therapist@serenity.spa");
  const viewer = await staffLogin("serenity-spa", "viewer@serenity.spa");
  const ctx = await fixtures();

  const deniedViewer = await app.inject({
    method: "GET",
    url: "/spa/treatment-notes",
    headers: { authorization: `Bearer ${viewer.token}` },
  });
  assert.equal(deniedViewer.statusCode, 403);

  const deniedReception = await app.inject({
    method: "POST",
    url: "/spa/consultations",
    headers: { authorization: `Bearer ${reception.token}` },
    payload: { customerId: ctx.guest.id, notes: "secret" },
  });
  assert.equal(deniedReception.statusCode, 403);

  const ok = await app.inject({
    method: "POST",
    url: "/spa/consultations",
    headers: { authorization: `Bearer ${therapist.token}` },
    payload: { customerId: ctx.guest.id, notes: "prefs discussed", recommendations: "massage" },
  });
  assert.equal(ok.statusCode, 200, ok.body);

  const treatment = await app.inject({
    method: "POST",
    url: "/spa/treatments",
    headers: { authorization: `Bearer ${admin.token}` },
    payload: { name: "Pedicure", code: `P-${Date.now()}`, durationMinutes: 45, price: 50 },
  });
  const appt = await app.inject({
    method: "POST",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${admin.token}` },
    payload: {
      customerId: ctx.guest.id,
      treatmentId: treatment.json().treatment.id,
      startsAt: futureIso(8, 10),
    },
  });
  const complete = await app.inject({
    method: "POST",
    url: `/spa/appointments/${appt.json().appointment.id}/complete`,
    headers: { authorization: `Bearer ${therapist.token}` },
    payload: {
      generalNotes: "Went well",
      aftercareInstructions: "Moisturize daily",
    },
  });
  assert.equal(complete.statusCode, 200, complete.body);
  assert.ok(complete.json().aftercare);

  const guest = await guestLogin();
  const aftercare = await app.inject({
    method: "GET",
    url: "/guest/spa/aftercare",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(aftercare.statusCode, 200);
  assert.ok(aftercare.json().aftercare.length >= 1);
  // Guest must not see internal treatment notes endpoint
  const notes = await app.inject({
    method: "GET",
    url: "/spa/treatment-notes",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.ok(notes.statusCode === 401 || notes.statusCode === 403);
});
