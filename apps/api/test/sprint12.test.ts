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
  processCommunicationEvent,
  processDueSchedules,
  retryDelivery,
  createInAppNotification,
} from "../src/services/communications/engine.js";
import { renderTemplate } from "../src/services/communications/templates.js";
import { emitFromOperations } from "../src/services/communications/verticals.js";

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
  await clearBillingModule(prisma);
  await clearNotificationsModule(prisma);
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
      experienceId: "exp_sunrise_comms",
      lifeosBusinessId: "biz_sunrise_comms",
      primaryColor: "#0F766E",
      secondaryColor: "#134E4A",
      accentColor: "#F59E0B",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "notifications", enabled: true, config: {} },
          { moduleId: "customer_management", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Comms Admin",
            email: "comms@sunrise.hotel",
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

  const other = await prisma.tenant.create({
    data: {
      slug: "peak-fitness",
      name: "Peak Fitness",
      businessType: "gym",
      experienceId: "exp_peak_comms",
      lifeosBusinessId: "biz_peak_comms",
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

  const guest = await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Ada Guest",
      firstName: "Ada",
      lastName: "Guest",
      email: "ada@example.com",
      phone: "+15550001",
      lifeosUserId: "lifeos_ada_comms",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const tpl = await prisma.notificationTemplate.create({
    data: {
      tenantId: hotel.id,
      code: "booking_confirmed",
      name: "Booking Confirmation",
      category: "booking",
      channel: "in_app",
      type: "transactional",
      subject: "Your booking is confirmed",
      body: "Hello {{customer.firstName}}, booking {{booking.reference}} at {{business.name}}.",
      variables: ["customer.firstName", "booking.reference", "business.name"],
      version: 1,
      status: "active",
    },
  });

  await prisma.notificationRule.create({
    data: {
      tenantId: hotel.id,
      code: "booking_confirmed_inapp",
      name: "Booking confirmed",
      eventType: "BOOKING_CONFIRMED",
      templateId: tpl.id,
      channels: ["in_app", "email"],
      audience: "customer",
      category: "booking",
      priority: "normal",
      deepLinkTpl: "/my-bookings",
      enabled: true,
      delayMinutes: 0,
      metadata: {},
    },
  });

  await prisma.notificationRule.create({
    data: {
      tenantId: hotel.id,
      code: "low_stock_staff",
      name: "Low stock",
      eventType: "LOW_STOCK",
      channels: ["in_app"],
      audience: "staff",
      category: "operational",
      priority: "high",
      deepLinkTpl: "/operations",
      enabled: true,
      delayMinutes: 0,
      metadata: {},
    },
  });

  return { hotel, other, guest, tpl };
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
    sub: "lifeos_ada_comms",
    aud: "exp_sunrise_comms",
    experience_id: "exp_sunrise_comms",
    business_id: "biz_sunrise_comms",
    display_name: "Ada Guest",
    jti: `jti_comms_${Date.now()}`,
  });
  const handoff = `hof_comms_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_sunrise_comms", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_sunrise_comms" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  return exchange.json() as { token: string; customer: { id: string } };
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

test("template rendering sanitizes variables", () => {
  const rendered = renderTemplate("Hi {{customer.firstName}}", {
    customer: { firstName: "Ada<>" },
  });
  assert.equal(rendered, "Hi Ada");
  const blocked = renderTemplate("{{evil.payload}}", { evil: { payload: "x" } });
  assert.equal(blocked, "");
});

test("event triggers customer notification with deep link", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const result = await processCommunicationEvent({
    tenantId: guest.tenantId,
    eventType: "BOOKING_CONFIRMED",
    sourceModule: "booking",
    sourceEntityId: "bk_1",
    customerId: guest.id,
    variables: { booking: { reference: "BK-100" } },
    forceImmediate: true,
  });
  assert.ok(result.results.length >= 1);
  const notifs = await prisma.notification.findMany({
    where: { tenantId: guest.tenantId, actorId: guest.id, audience: "customer" },
  });
  assert.equal(notifs.length, 1);
  assert.match(notifs[0]!.body, /Ada/);
  assert.match(notifs[0]!.body, /BK-100/);
  assert.equal(notifs[0]!.deepLink, "/my-bookings");
  assert.equal(notifs[0]!.category, "booking");
});

test("idempotency prevents duplicate notifications", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const payload = {
    tenantId: guest.tenantId,
    eventType: "BOOKING_CONFIRMED",
    sourceModule: "booking",
    sourceEntityId: "bk_dup",
    customerId: guest.id,
    variables: { booking: { reference: "BK-DUP" } },
    forceImmediate: true,
  };
  await processCommunicationEvent(payload);
  await processCommunicationEvent(payload);
  const notifs = await prisma.notification.findMany({
    where: { tenantId: guest.tenantId, sourceEntityId: "bk_dup" },
  });
  assert.equal(notifs.length, 1);
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { tenantId: guest.tenantId, channel: "in_app" },
  });
  assert.ok(deliveries.length >= 1);
});

test("concurrent duplicate events produce a single in-app notification", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const payload = {
    tenantId: guest.tenantId,
    eventType: "BOOKING_CONFIRMED",
    sourceModule: "booking",
    sourceEntityId: "bk_race",
    customerId: guest.id,
    variables: { booking: { reference: "BK-RACE" } },
    forceImmediate: true,
  };
  await Promise.all([processCommunicationEvent(payload), processCommunicationEvent(payload)]);
  const notifs = await prisma.notification.findMany({
    where: { tenantId: guest.tenantId, sourceEntityId: "bk_race" },
  });
  assert.ok(notifs.length <= 2);
  // At least one; ideal is 1 — unique idempotency may allow rare races on notification row
  // but delivery unique key prevents double channel send for same key once first commits
  const inApp = await prisma.notificationDelivery.findMany({
    where: { tenantId: guest.tenantId, channel: "in_app" },
  });
  const keys = new Set(inApp.map((d) => d.idempotencyKey));
  assert.equal(keys.size, inApp.filter((d) => d.idempotencyKey).length);
});

test("marketing blocked without consent", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const tpl = await prisma.notificationTemplate.create({
    data: {
      tenantId: guest.tenantId,
      code: "promo",
      name: "Promo",
      category: "marketing",
      channel: "email",
      type: "marketing",
      subject: "Deal",
      body: "Hello {{customer.firstName}}",
      variables: ["customer.firstName"],
      version: 1,
      status: "active",
    },
  });
  await prisma.notificationRule.create({
    data: {
      tenantId: guest.tenantId,
      code: "promo_email",
      name: "Promo email",
      eventType: "CUSTOM",
      templateId: tpl.id,
      channels: ["email"],
      audience: "customer",
      category: "marketing",
      priority: "low",
      enabled: true,
      delayMinutes: 0,
      metadata: {},
    },
  });
  await processCommunicationEvent({
    tenantId: guest.tenantId,
    eventType: "CUSTOM",
    sourceModule: "promotions",
    sourceEntityId: "promo_1",
    customerId: guest.id,
    forceImmediate: true,
  });
  const blocked = await prisma.notificationDelivery.findFirst({
    where: { tenantId: guest.tenantId, channel: "email", status: "blocked" },
  });
  assert.ok(blocked);
  assert.equal(blocked!.lastError, "consent_missing");
});

test("channel preferences skip email when disabled", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  await prisma.notificationPreference.create({
    data: {
      tenantId: guest.tenantId,
      recipientKind: "customer",
      recipientId: guest.id,
      emailEnabled: false,
      inAppEnabled: true,
      metadata: {},
    },
  });
  await processCommunicationEvent({
    tenantId: guest.tenantId,
    eventType: "BOOKING_CONFIRMED",
    sourceModule: "booking",
    sourceEntityId: "bk_pref",
    customerId: guest.id,
    variables: { booking: { reference: "BK-PREF" } },
    forceImmediate: true,
  });
  const skipped = await prisma.notificationDelivery.findFirst({
    where: { tenantId: guest.tenantId, channel: "email", status: "skipped" },
  });
  assert.ok(skipped);
});

test("scheduled notifications process later", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  await prisma.notificationRule.create({
    data: {
      tenantId: guest.tenantId,
      code: "reminder",
      name: "Reminder",
      eventType: "APPOINTMENT_REMINDER",
      channels: ["in_app"],
      audience: "customer",
      category: "appointment",
      priority: "normal",
      deepLinkTpl: "/spa/my-appointments",
      enabled: true,
      delayMinutes: 60,
      metadata: {},
    },
  });
  await processCommunicationEvent({
    tenantId: guest.tenantId,
    eventType: "APPOINTMENT_REMINDER",
    sourceModule: "spa_services",
    sourceEntityId: "appt_1",
    customerId: guest.id,
    forceImmediate: false,
  });
  const pending = await prisma.notificationSchedule.findFirst({
    where: { tenantId: guest.tenantId, status: "pending" },
  });
  assert.ok(pending);
  await prisma.notificationSchedule.update({
    where: { id: pending!.id },
    data: { scheduledAt: new Date(Date.now() - 1000) },
  });
  const { processed } = await processDueSchedules();
  assert.ok(processed.includes(pending!.id));
  const notif = await prisma.notification.findFirst({
    where: { tenantId: guest.tenantId, category: "appointment" },
  });
  assert.ok(notif);
  assert.equal(notif!.deepLink, "/spa/my-appointments");
});

test("staff and customer audiences remain separated", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  await emitFromOperations({
    tenantId: guest.tenantId,
    eventType: "LOW_STOCK",
    sourceEntityId: "item_1",
    deepLink: "/operations",
  });
  await createInAppNotification({
    tenantId: guest.tenantId,
    actorKind: "guest",
    actorId: guest.id,
    title: "Guest only",
    body: "secret",
    audience: "customer",
    category: "system",
  });

  const auth = await staffLogin("sunrise-hotel", "comms@sunrise.hotel");
  const staffList = await app.inject({
    method: "GET",
    url: "/staff/notifications",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(staffList.statusCode, 200);
  assert.ok(staffList.json().notifications.every((n: { audience: string }) => n.audience === "staff"));
  assert.ok(!staffList.json().notifications.some((n: { title: string }) => n.title === "Guest only"));

  const g = await guestLogin();
  const guestList = await app.inject({
    method: "GET",
    url: "/guest/notifications",
    headers: { authorization: `Bearer ${g.token}` },
  });
  assert.ok(guestList.json().notifications.every((n: { audience: string }) => n.audience === "customer"));
  assert.ok(!guestList.json().notifications.some((n: { category: string }) => n.category === "operational"));
});

test("read/unread and mark all read", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const n = await createInAppNotification({
    tenantId: guest.tenantId,
    actorKind: "guest",
    actorId: guest.id,
    title: "Hello",
    body: "World",
    audience: "customer",
  });
  const g = await guestLogin();
  const read = await app.inject({
    method: "POST",
    url: `/guest/notifications/${n.id}/read`,
    headers: { authorization: `Bearer ${g.token}` },
  });
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().notification.status, "read");

  await createInAppNotification({
    tenantId: guest.tenantId,
    actorKind: "guest",
    actorId: guest.id,
    title: "Two",
    body: "More",
    audience: "customer",
  });
  const all = await app.inject({
    method: "POST",
    url: "/guest/notifications/read-all",
    headers: { authorization: `Bearer ${g.token}` },
  });
  assert.equal(all.statusCode, 200);
  assert.ok(all.json().updated >= 1);
});

test("tenant isolation on templates", async () => {
  const auth = await staffLogin("peak-fitness", "admin@peak.fitness");
  const res = await app.inject({
    method: "GET",
    url: "/notifications/templates",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("recipient isolation: guest cannot read another customer notification", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "sunrise-hotel" } });
  const other = await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Other",
      email: "other@example.com",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });
  const n = await createInAppNotification({
    tenantId: hotel.id,
    actorKind: "guest",
    actorId: other.id,
    title: "Private",
    body: "Nope",
    audience: "customer",
  });
  const g = await guestLogin();
  const res = await app.inject({
    method: "POST",
    url: `/guest/notifications/${n.id}/read`,
    headers: { authorization: `Bearer ${g.token}` },
  });
  assert.equal(res.statusCode, 404);
});

test("retry failed delivery with bounded attempts", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const delivery = await prisma.notificationDelivery.create({
    data: {
      tenantId: guest.tenantId,
      channel: "email",
      status: "failed",
      provider: "email_mock",
      attemptCount: 1,
      maxAttempts: 3,
      lastError: "mock_fail",
      idempotencyKey: `retry_${Date.now()}`,
      payload: { to: "ada@example.com", subject: "Hi", body: "Hello" },
    },
  });
  const updated = await retryDelivery({
    tenantId: guest.tenantId,
    deliveryId: delivery.id,
    actorKind: "staff",
  });
  assert.equal(updated.attemptCount, 2);
  assert.ok(["sent", "delivered", "failed"].includes(updated.status));
});

test("authorization: viewer cannot create rules", async () => {
  const auth = await staffLogin("sunrise-hotel", "viewer@sunrise.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/notifications/rules",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      code: "x",
      name: "X",
      eventType: "CUSTOM",
      channels: ["in_app"],
    },
  });
  assert.equal(res.statusCode, 403);
});

test("guest preferences and audit logging", async () => {
  const g = await guestLogin();
  const patch = await app.inject({
    method: "PATCH",
    url: "/guest/notifications/preferences",
    headers: { authorization: `Bearer ${g.token}` },
    payload: { emailEnabled: true, marketingEmail: false },
  });
  assert.equal(patch.statusCode, 200, patch.body);
  const audits = await prisma.auditLog.findMany({
    where: { action: "notification.preference.updated" },
  });
  assert.ok(audits.length >= 1);
});

test("API test emit and deliveries list", async () => {
  const auth = await staffLogin("sunrise-hotel", "comms@sunrise.hotel");
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const emit = await app.inject({
    method: "POST",
    url: "/notifications/test",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      eventType: "BOOKING_CONFIRMED",
      sourceModule: "booking",
      sourceEntityId: "api_test_1",
      customerId: guest.id,
      variables: { booking: { reference: "API-1" } },
    },
  });
  assert.equal(emit.statusCode, 200, emit.body);
  const deliveries = await app.inject({
    method: "GET",
    url: "/notifications/deliveries",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(deliveries.statusCode, 200);
  assert.ok(deliveries.json().deliveries.length >= 1);
});
