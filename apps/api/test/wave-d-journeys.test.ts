/**
 * Wave D — API-level E2E journey coverage (hotel, dining, fitness, spa, jobs).
 */
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
import { clearBillingModule } from "./helpers/cleanup-billing.js";
import { clearBookingEngine } from "./helpers/cleanup-booking.js";
import { clearFitnessModule } from "./helpers/cleanup-fitness.js";
import { clearDiningModule } from "./helpers/cleanup-dining.js";
import { clearSpaModule } from "./helpers/cleanup-spa.js";
import { clearEventsModule } from "./helpers/cleanup-events.js";
import { clearCinemaModule } from "./helpers/cleanup-cinema.js";
import { collectManualPayment, recordCashPayment } from "../src/services/billing/engine.js";
import { createReservation } from "../src/services/accommodation.js";
import { createOrder, transitionOrder } from "../src/services/restaurant.js";
import { createMembership } from "../src/services/fitness.js";
import { bookSpaAppointment } from "../src/services/spa.js";
import { processDueJobs, enqueueJob } from "../src/services/jobs.js";

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
];

const MODULES = [
  "spa_services",
  "events",
  "cinema",
  "billing",
  "accommodation",
  "restaurant",
  "gym_membership",
] as const;

async function resetDb() {
  await prisma.backgroundJob.deleteMany().catch(() => undefined);
  await prisma.reservationTimeline.deleteMany().catch(() => undefined);
  await prisma.reservationGuest.deleteMany().catch(() => undefined);
  await prisma.stay.deleteMany().catch(() => undefined);
  await prisma.accommodationReservation.deleteMany().catch(() => undefined);
  await clearCinemaModule(prisma);
  await clearEventsModule(prisma);
  await clearSpaModule(prisma);
  await clearFitnessModule(prisma);
  await clearDiningModule(prisma);
  await clearBillingModule(prisma);
  await clearBookingEngine(prisma);
  await prisma.roomAvailability.deleteMany().catch(() => undefined);
  await prisma.room.deleteMany().catch(() => undefined);
  await prisma.roomType.deleteMany().catch(() => undefined);
  await prisma.property.deleteMany().catch(() => undefined);
  await prisma.customerEvent.deleteMany().catch(() => undefined);
  await prisma.notification.deleteMany().catch(() => undefined);
  await prisma.auditLog.deleteMany();
  await prisma.guestSession.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany().catch(() => undefined);

  const org = await prisma.organization.create({
    data: { slug: "org-wave-d-j", name: "Wave D Journey Org", status: "active", metadata: {} },
  });

  const hotel = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "waved-a",
      name: "Wave D A",
      businessType: "hotel",
      experienceId: "exp_wave_d_a",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: MODULES.map((moduleId) => ({ moduleId, enabled: true, config: {} })),
      },
      staff: {
        create: [
          {
            displayName: "Admin A",
            email: "admin@waved-a.hotel",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });

  await prisma.branch.create({
    data: { tenantId: hotel.id, name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC" },
  });

  await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Ada Guest",
      email: "ada@waved-a.hotel",
      lifeosUserId: "lifeos_ada_wave_d",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "waved-b",
      name: "Wave D B",
      businessType: "hotel",
      experienceId: "exp_wave_d_b",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: MODULES.map((moduleId) => ({ moduleId, enabled: true, config: {} })),
      },
      staff: {
        create: [
          {
            displayName: "Admin B",
            email: "admin@waved-b.hotel",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });

  return hotel;
}

async function staffLogin(slug = "waved-a", email = "admin@waved-a.hotel") {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: slug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string; staff: { id: string } };
}

async function guestLogin(lifeosUserId = "lifeos_ada_wave_d", experienceId = "exp_wave_d_a") {
  const token = await mockLifeOs.issueToken({
    sub: lifeosUserId,
    aud: experienceId,
    experience_id: experienceId,
    business_id: "biz_wave_d",
    display_name: "Ada Guest",
    jti: `jti_wd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });
  const handoff = `hof_wd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  mockLifeOs.setHandoff(handoff, experienceId, token);
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; customer: { id: string }; tenantId: string };
}

before(async () => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  mockLifeOs = await startMockLifeOs();
  config.lifeosApiUrl = mockLifeOs.baseUrl;
  config.lifeosJwksUrl = mockLifeOs.jwksUrl;
  app = await buildApp();
});

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  await app.close();
  await mockLifeOs.close();
  await prisma.$disconnect();
});

test("Wave D journey: hotel reservation → invoice → cash → receipt → guest activity", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const property = await prisma.property.create({
    data: {
      tenantId: hotel.id,
      name: "Tower",
      code: "T1",
      propertyType: "hotel",
      status: "active",
      timezone: "UTC",
    },
  });
  const roomType = await prisma.roomType.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      name: "Deluxe",
      code: "DLX",
      status: "active",
      baseRate: 100000,
      capacity: 2,
      photoUrls: [],
    },
  });
  await prisma.room.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      roomTypeId: roomType.id,
      number: "101",
      status: "active",
      occupancyStatus: "vacant",
      housekeepingStatus: "clean",
    },
  });

  const checkIn = new Date("2030-06-10T12:00:00Z");
  const checkOut = new Date("2030-06-12T12:00:00Z");
  const reservation = await createReservation({
    tenantId: hotel.id,
    propertyId: property.id,
    roomTypeId: roomType.id,
    customerId: customer.id,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const billable = await prisma.billableItem.findFirst({
    where: {
      tenantId: hotel.id,
      sourceModule: "accommodation",
      sourceEntityId: reservation.id,
    },
  });
  assert.ok(billable?.invoiceId);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: billable!.invoiceId! } });

  const pay = await recordCashPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: invoice.amountDue,
    staffId: staff.staff.id,
    idempotencyKey: `wave_d_hotel_${invoice.id}`,
  });
  assert.equal(pay.status, "captured");
  const receipt = await prisma.receipt.findFirst({ where: { paymentId: pay.id } });
  assert.ok(receipt);

  const guest = await guestLogin();
  const activity = await app.inject({
    method: "GET",
    url: "/guest/activity",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(activity.statusCode, 200, activity.body);
  const items = (activity.json() as { items: Array<{ category: string }> }).items;
  assert.ok(items.some((i) => i.category === "reservation"));
  assert.ok(items.some((i) => i.category === "invoice"));
  assert.ok(items.some((i) => i.category === "receipt"));
});

test("Wave D journey: dining order → complete → invoice → pay_to_staff → billStatus paid", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const order = await createOrder({
    tenantId: hotel.id,
    customerId: customer.id,
    orderType: "dine_in",
    items: [{ name: "Jollof", quantity: 1, unitPrice: 5000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  await transitionOrder({
    tenantId: hotel.id,
    orderId: order.id,
    status: "completed",
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const billable = await prisma.billableItem.findFirst({
    where: { tenantId: hotel.id, sourceModule: "restaurant", sourceEntityId: order.id },
  });
  assert.ok(billable?.invoiceId);

  await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: billable!.invoiceId!,
    amount: billable!.total,
    methodType: "pay_to_staff",
    staffId: staff.staff.id,
    idempotencyKey: `dining_${order.id}`,
  });

  const updated = await prisma.diningOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(updated.billStatus, "paid");
});

test("Wave D journey: fitness membership activate false → pay → active", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const plan = await prisma.membershipPlan.create({
    data: {
      tenantId: hotel.id,
      name: "Monthly",
      code: "M1",
      durationDays: 30,
      price: 20000,
      status: "active",
      accessRules: {},
      includedClasses: [],
    },
  });

  const membership = await createMembership({
    tenantId: hotel.id,
    planId: plan.id,
    customerId: customer.id,
    activate: false,
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  assert.equal(membership.status, "pending");

  const billable = await prisma.billableItem.findFirst({
    where: {
      tenantId: hotel.id,
      sourceModule: "gym_membership",
      sourceEntityId: membership.id,
    },
  });
  assert.ok(billable?.invoiceId);

  await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: billable!.invoiceId!,
    amount: billable!.total,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `mem_${membership.id}`,
  });

  const active = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
  assert.equal(active.status, "active");
});

test("Wave D journey: spa bookSpaAppointment → invoice", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const treatment = await prisma.treatment.create({
    data: {
      tenantId: hotel.id,
      name: "Massage",
      code: "MSG",
      durationMinutes: 60,
      price: 15000,
      status: "active",
      requiredSpecialties: [],
      requiredRoomTypes: [],
      imageUrls: [],
      metadata: {},
    },
  });

  const startsAt = new Date(Date.now() + 86400000);
  const { appointment } = await bookSpaAppointment({
    tenantId: hotel.id,
    customerId: customer.id,
    treatmentId: treatment.id,
    startsAt,
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const billable = await prisma.billableItem.findFirst({
    where: {
      tenantId: hotel.id,
      sourceModule: "spa_services",
      sourceEntityId: appointment.id,
    },
  });
  assert.ok(billable?.invoiceId);
  assert.equal(billable!.total, 15000);
});

test("Wave D journey: processDueJobs runs without throw", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  await enqueueJob({
    tenantId: hotel.id,
    type: "cinema.release_expired_holds",
    idempotencyKey: `journey_jobs_${hotel.id}`,
    payload: {},
  });
  await assert.doesNotReject(async () => {
    await processDueJobs();
  });
});
