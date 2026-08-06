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
        create: [
          { moduleId: "gym_membership", enabled: true, config: {} },
          { moduleId: "fitness_classes", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Gym Admin",
            email: "ops@peak.fitness",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
          {
            displayName: "Front Desk",
            email: "desk@peak.fitness",
            passwordHash: hashPassword("password123"),
            role: "front_desk",
            branchIds: [],
          },
          {
            displayName: "Trainer Role",
            email: "trainer@peak.fitness",
            passwordHash: hashPassword("password123"),
            role: "trainer",
            branchIds: [],
          },
          {
            displayName: "Viewer",
            email: "viewer@peak.fitness",
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
      tenantId: gym.id,
      displayName: "Mia Member",
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
      tenantId: gym.id,
      displayName: "Sam Second",
      email: "sam@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { gym, hotel, guest, guest2 };
}

async function fixtures() {
  const gym = await prisma.tenant.findUniqueOrThrow({ where: { slug: "peak-fitness" } });
  const guest = await prisma.customer.findFirstOrThrow({
    where: { tenantId: gym.id, email: "mia@example.com" },
  });
  const guest2 = await prisma.customer.findFirstOrThrow({
    where: { tenantId: gym.id, email: "sam@example.com" },
  });
  return { gym, guest, guest2 };
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
    aud: "exp_peak_fitness",
    experience_id: "exp_peak_fitness",
    business_id: "biz_peak_fitness",
    display_name: "Mia Member",
    jti: `jti_d6_${Date.now()}`,
  });
  const handoff = `hof_d6_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_peak_fitness", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_peak_fitness" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  const body = exchange.json() as { token: string; customer: { id: string } };
  return { token: body.token, customerId: body.customer.id };
}

async function seedFacility(auth: { token: string }) {
  const facility = await app.inject({
    method: "POST",
    url: "/fitness/facilities",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Main Gym", code: `GYM-${Date.now()}`, description: "Floor" },
  });
  assert.equal(facility.statusCode, 200, facility.body);
  const area = await app.inject({
    method: "POST",
    url: `/fitness/facilities/${facility.json().facility.id}/areas`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Studio", code: `ST-${Date.now()}`, areaType: "studio", capacity: 20 },
  });
  assert.equal(area.statusCode, 200, area.body);
  return { facility: facility.json().facility, area: area.json().area };
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

test("tenant isolation: hotel without gym cannot access fitness APIs", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/fitness/dashboard",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("membership plan uses Commerce Engine offering", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const { facility } = await seedFacility(auth);
  const plan = await app.inject({
    method: "POST",
    url: "/fitness/plans",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Monthly",
      code: `M-${Date.now()}`,
      durationDays: 30,
      price: 79,
      facilityId: facility.id,
    },
  });
  assert.equal(plan.statusCode, 200, plan.body);
  const created = plan.json().plan;
  assert.ok(created.offeringId);
  const offering = await prisma.offering.findUnique({ where: { id: created.offeringId } });
  assert.ok(offering);
  assert.equal(offering!.moduleId, "gym_membership");
  assert.equal(offering!.basePrice, 79);
});

test("membership lifecycle: activate freeze resume cancel renew", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const plan = await app.inject({
    method: "POST",
    url: "/fitness/plans",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Quarterly", code: `Q-${Date.now()}`, durationDays: 90, price: 199 },
  });
  assert.equal(plan.statusCode, 200, plan.body);

  const created = await app.inject({
    method: "POST",
    url: "/fitness/memberships",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { planId: plan.json().plan.id, customerId: ctx.guest.id, activate: true },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().membership.status, "active");

  const freeze = await app.inject({
    method: "POST",
    url: `/fitness/memberships/${created.json().membership.id}/freeze`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { reason: "travel" },
  });
  assert.equal(freeze.statusCode, 200, freeze.body);
  assert.equal(freeze.json().membership.status, "frozen");

  const resume = await app.inject({
    method: "POST",
    url: `/fitness/memberships/${created.json().membership.id}/resume`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {},
  });
  assert.equal(resume.statusCode, 200, resume.body);
  assert.equal(resume.json().membership.status, "active");

  const cancel = await app.inject({
    method: "POST",
    url: `/fitness/memberships/${created.json().membership.id}/cancel`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {},
  });
  assert.equal(cancel.statusCode, 200, cancel.body);
  assert.equal(cancel.json().membership.status, "cancelled");

  const renew = await app.inject({
    method: "POST",
    url: `/fitness/memberships/${created.json().membership.id}/renew`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {},
  });
  assert.equal(renew.statusCode, 200, renew.body);
  assert.equal(renew.json().membership.status, "active");

  const audits = await prisma.auditLog.findMany({
    where: { tenantId: ctx.gym.id, resource: "membership" },
  });
  assert.ok(audits.length >= 4);
});

test("membership eligibility blocks class booking when required", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const fitnessClass = await app.inject({
    method: "POST",
    url: "/fitness/classes",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Members Only HIIT",
      code: `HIIT-${Date.now()}`,
      capacity: 10,
      membershipRequired: true,
    },
  });
  assert.equal(fitnessClass.statusCode, 200, fitnessClass.body);
  const session = await app.inject({
    method: "POST",
    url: "/fitness/sessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      classId: fitnessClass.json().class.id,
      startsAt: futureIso(5),
    },
  });
  assert.equal(session.statusCode, 200, session.body);
  const book = await app.inject({
    method: "POST",
    url: `/fitness/sessions/${session.json().session.id}/book`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { customerId: ctx.guest.id },
  });
  assert.equal(book.statusCode, 403);
  assert.equal(book.json().error, "membership_required");
});

test("class session creates Booking Engine resource and books", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const fitnessClass = await app.inject({
    method: "POST",
    url: "/fitness/classes",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Yoga", code: `Y-${Date.now()}`, capacity: 5 },
  });
  const session = await app.inject({
    method: "POST",
    url: "/fitness/sessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { classId: fitnessClass.json().class.id, startsAt: futureIso(4) },
  });
  assert.equal(session.statusCode, 200, session.body);
  const row = await prisma.classSession.findUnique({
    where: { id: session.json().session.id },
  });
  assert.ok(row?.bookableResourceId);
  const resource = await prisma.bookableResource.findUnique({
    where: { id: row!.bookableResourceId! },
  });
  assert.equal(resource!.sourceType, "class_session");
  assert.equal(resource!.moduleId, "fitness_classes");

  const book = await app.inject({
    method: "POST",
    url: `/fitness/sessions/${session.json().session.id}/book`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { customerId: ctx.guest.id },
  });
  assert.equal(book.statusCode, 200, book.body);
  assert.ok(book.json().booking.id);
  assert.ok(book.json().classBooking.id);
});

test("class capacity waitlist via Booking Engine", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const fitnessClass = await app.inject({
    method: "POST",
    url: "/fitness/classes",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Spin", code: `SP-${Date.now()}`, capacity: 1 },
  });
  const session = await app.inject({
    method: "POST",
    url: "/fitness/sessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      classId: fitnessClass.json().class.id,
      startsAt: futureIso(6),
      capacity: 1,
    },
  });
  const first = await app.inject({
    method: "POST",
    url: `/fitness/sessions/${session.json().session.id}/book`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { customerId: ctx.guest.id },
  });
  assert.equal(first.statusCode, 200, first.body);
  const second = await app.inject({
    method: "POST",
    url: `/fitness/sessions/${session.json().session.id}/book`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { customerId: ctx.guest2.id, joinWaitlistIfUnavailable: true },
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error, "waitlisted");
  assert.ok(second.json().waitlistEntry);
});

test("trainer availability and personal training booking", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const trainer = await app.inject({
    method: "POST",
    url: "/fitness/trainers",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      displayName: "Coach A",
      email: `coach-${Date.now()}@peak.fitness`,
      specializations: ["strength"],
    },
  });
  assert.equal(trainer.statusCode, 200, trainer.body);
  const startsAt = futureIso(7, 11);
  const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60000).toISOString();
  const pt = await app.inject({
    method: "POST",
    url: "/fitness/training-sessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      trainerId: trainer.json().trainer.id,
      customerId: ctx.guest.id,
      startsAt,
      endsAt,
    },
  });
  assert.equal(pt.statusCode, 200, pt.body);
  assert.ok(pt.json().booking.id);
  assert.ok(pt.json().session.id);
  const conflict = await app.inject({
    method: "POST",
    url: "/fitness/training-sessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      trainerId: trainer.json().trainer.id,
      customerId: ctx.guest2.id,
      startsAt,
      endsAt,
    },
  });
  assert.ok(conflict.statusCode >= 400, conflict.body);
});

test("attendance and check-in", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const attendance = await app.inject({
    method: "POST",
    url: "/fitness/attendance",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      customerId: ctx.guest.id,
      kind: "gym",
      status: "present",
      location: "Floor",
    },
  });
  assert.equal(attendance.statusCode, 200, attendance.body);
  const checkIn = await app.inject({
    method: "POST",
    url: "/fitness/check-ins",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { customerId: ctx.guest.id, kind: "gym" },
  });
  assert.equal(checkIn.statusCode, 200, checkIn.body);
});

test("access pass creates Commerce offering", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const startsAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
  const pass = await app.inject({
    method: "POST",
    url: "/fitness/access-passes",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "day_pass",
      customerId: ctx.guest.id,
      startsAt,
      expiresAt,
      allowedAreas: ["FLOOR"],
    },
  });
  assert.equal(pass.statusCode, 200, pass.body);
  assert.ok(pass.json().pass.offeringId);
  const offering = await prisma.offering.findUnique({
    where: { id: pass.json().pass.offeringId },
  });
  assert.equal(offering!.moduleId, "gym_membership");
});

test("TrustID / LifeOS identity maps to member profile", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const guest = await guestLogin();
  const plan = await app.inject({
    method: "POST",
    url: "/fitness/plans",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Annual", code: `A-${Date.now()}`, durationDays: 365, price: 699 },
  });
  const membership = await app.inject({
    method: "POST",
    url: "/fitness/memberships",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { planId: plan.json().plan.id, customerId: guest.customerId, activate: true },
  });
  assert.equal(membership.statusCode, 200, membership.body);
  const profile = await prisma.memberProfile.findUnique({
    where: {
      tenantId_customerId: {
        tenantId: membership.json().membership.tenantId,
        customerId: guest.customerId,
      },
    },
  });
  assert.ok(profile);
  const customer = await prisma.customer.findUnique({ where: { id: guest.customerId } });
  assert.equal(customer!.lifeosUserId, "lifeos_mia");
  const home = await app.inject({
    method: "GET",
    url: "/guest/fitness/home",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(home.statusCode, 200, home.body);
  assert.equal(home.json().membership.status, "active");
});

test("role permissions: viewer cannot create plans; trainer can book PT", async () => {
  const viewer = await staffLogin("peak-fitness", "viewer@peak.fitness");
  const denied = await app.inject({
    method: "POST",
    url: "/fitness/plans",
    headers: { authorization: `Bearer ${viewer.token}` },
    payload: { name: "X", code: `X-${Date.now()}`, price: 1 },
  });
  assert.equal(denied.statusCode, 403);

  const trainer = await staffLogin("peak-fitness", "trainer@peak.fitness");
  const admin = await staffLogin("peak-fitness", "ops@peak.fitness");
  const ctx = await fixtures();
  const t = await app.inject({
    method: "POST",
    url: "/fitness/trainers",
    headers: { authorization: `Bearer ${admin.token}` },
    payload: { displayName: "T1", specializations: ["hiit"] },
  });
  const startsAt = futureIso(8, 14);
  const endsAt = new Date(new Date(startsAt).getTime() + 45 * 60000).toISOString();
  const pt = await app.inject({
    method: "POST",
    url: "/fitness/training-sessions",
    headers: { authorization: `Bearer ${trainer.token}` },
    payload: {
      trainerId: t.json().trainer.id,
      customerId: ctx.guest.id,
      startsAt,
      endsAt,
    },
  });
  assert.equal(pt.statusCode, 200, pt.body);
});

test("guest can book class and check in", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const guest = await guestLogin();
  const fitnessClass = await app.inject({
    method: "POST",
    url: "/fitness/classes",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Dance", code: `D-${Date.now()}`, capacity: 12 },
  });
  const session = await app.inject({
    method: "POST",
    url: "/fitness/sessions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { classId: fitnessClass.json().class.id, startsAt: futureIso(3, 18) },
  });
  const book = await app.inject({
    method: "POST",
    url: `/guest/fitness/sessions/${session.json().session.id}/book`,
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(book.statusCode, 200, book.body);
  const checkIn = await app.inject({
    method: "POST",
    url: "/guest/fitness/check-in",
    headers: { authorization: `Bearer ${guest.token}` },
    payload: { kind: "gym" },
  });
  assert.equal(checkIn.statusCode, 200, checkIn.body);
});
