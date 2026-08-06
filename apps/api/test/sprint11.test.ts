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
import { mergeCustomers, recordCustomerEvent } from "../src/services/crm.js";

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
      experienceId: "exp_sunrise_crm",
      lifeosBusinessId: "biz_sunrise_crm",
      primaryColor: "#0F766E",
      secondaryColor: "#134E4A",
      accentColor: "#F59E0B",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "customer_management", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "CRM Admin",
            email: "crm@sunrise.hotel",
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
      experienceId: "exp_peak_crm",
      lifeosBusinessId: "biz_peak_crm",
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
      customers: {
        create: [
          {
            displayName: "Other Tenant Guest",
            email: "other@example.com",
            preferences: {},
            loyaltyPlaceholder: {},
            metadata: {},
          },
        ],
      },
    },
  });

  const guest = await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Ada Guest",
      email: "ada@example.com",
      phone: "+15550001",
      lifeosUserId: "lifeos_ada",
      trustId: "trust_ada",
      externalIdentityRef: "trust_ada",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { hotel, other, guest };
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
    sub: "lifeos_ada",
    aud: "exp_sunrise_crm",
    experience_id: "exp_sunrise_crm",
    business_id: "biz_sunrise_crm",
    display_name: "Ada Guest",
    jti: `jti_crm_${Date.now()}`,
  });
  const handoff = `hof_crm_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_sunrise_crm", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_sunrise_crm" },
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

test("customer CRUD and search", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  const created = await app.inject({
    method: "POST",
    url: "/customers",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { displayName: "Bob", email: "bob@example.com", phone: "+1999" },
  });
  assert.equal(created.statusCode, 200, created.body);

  const search = await app.inject({
    method: "GET",
    url: "/search/customers?q=Bob",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(search.statusCode, 200);
  assert.ok(search.json().customers.some((c: { displayName: string }) => c.displayName === "Bob"));
});

test("tenant isolation on customers", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  const other = await prisma.customer.findFirstOrThrow({
    where: { email: "other@example.com" },
  });
  const res = await app.inject({
    method: "GET",
    url: `/customers/${other.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);

  const list = await app.inject({
    method: "GET",
    url: "/customers",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.ok(!list.json().customers.some((c: { id: string }) => c.id === other.id));
});

test("preferences tags notes consent", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });

  const pref = await app.inject({
    method: "POST",
    url: `/customers/${guest.id}/preferences`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { moduleId: "accommodation", key: "pillow", value: "firm" },
  });
  assert.equal(pref.statusCode, 201, pref.body);

  const tag = await app.inject({
    method: "POST",
    url: "/tags",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "VIP", code: "VIP" },
  });
  assert.equal(tag.statusCode, 201, tag.body);
  await app.inject({
    method: "POST",
    url: `/customers/${guest.id}/tags`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { tagId: tag.json().tag.id },
  });

  const note = await app.inject({
    method: "POST",
    url: `/customers/${guest.id}/notes`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { body: "Prefers quiet rooms" },
  });
  assert.equal(note.statusCode, 201, note.body);

  const consent = await app.inject({
    method: "POST",
    url: `/customers/${guest.id}/consent`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { purpose: "marketing_email", status: "granted", policyRef: "v1" },
  });
  assert.equal(consent.statusCode, 201, consent.body);
});

test("timeline includes stored and vertical events", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  await recordCustomerEvent({
    tenantId: auth.tenantId,
    customerId: guest.id,
    eventType: "CUSTOM",
    sourceModule: "customer_management",
    title: "Welcome call",
  });
  const timeline = await app.inject({
    method: "GET",
    url: `/customers/${guest.id}/timeline`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(timeline.statusCode, 200, timeline.body);
  assert.ok(timeline.json().timeline.some((t: { title: string }) => t.title === "Welcome call"));
});

test("segments feedback loyalty", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });

  const segment = await app.inject({
    method: "POST",
    url: "/segments",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Recent", code: "RECENT", rules: { lastVisitDays: 365 } },
  });
  assert.equal(segment.statusCode, 201, segment.body);
  const members = await app.inject({
    method: "GET",
    url: `/segments/${segment.json().segment.id}/members`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(members.statusCode, 200);
  assert.ok(members.json().customers.length >= 1);

  const fb = await app.inject({
    method: "POST",
    url: `/customers/${guest.id}/feedback`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { rating: 5, comment: "Great stay" },
  });
  assert.equal(fb.statusCode, 201, fb.body);

  const loyalty = await app.inject({
    method: "PATCH",
    url: `/customers/${guest.id}/loyalty`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { enroll: true, tier: "silver", pointsBalance: 100 },
  });
  assert.equal(loyalty.statusCode, 200, loyalty.body);
  assert.equal(loyalty.json().loyalty.status, "enrolled");
});

test("TrustID external identity reference preserved", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const profile = await app.inject({
    method: "GET",
    url: `/customers/${guest.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(profile.json().customer.trustId, "trust_ada");
  assert.equal(profile.json().customer.externalIdentityRef, "trust_ada");
  assert.equal(profile.json().customer.lifeosUserId, "lifeos_ada");
});

test("guest profile hides notes and shows preferences/timeline", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  await app.inject({
    method: "POST",
    url: `/customers/${guest.id}/notes`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { body: "SECRET INTERNAL" },
  });
  const g = await guestLogin();
  const me = await app.inject({
    method: "GET",
    url: "/guest/customer",
    headers: { authorization: `Bearer ${g.token}` },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().customer.displayName, "Ada Guest");
  assert.equal(me.json().notes, undefined);

  const prefs = await app.inject({
    method: "PATCH",
    url: "/guest/customer/preferences",
    headers: { authorization: `Bearer ${g.token}` },
    payload: { key: "dining", value: "window" },
  });
  assert.equal(prefs.statusCode, 200, prefs.body);
});

test("viewer cannot create notes; merge requires confirmation", async () => {
  const viewer = await staffLogin("sunrise-hotel", "viewer@sunrise.hotel");
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const denied = await app.inject({
    method: "POST",
    url: `/customers/${guest.id}/notes`,
    headers: { authorization: `Bearer ${viewer.token}` },
    payload: { body: "nope" },
  });
  assert.equal(denied.statusCode, 403);

  await assert.rejects(
    () =>
      mergeCustomers({
        tenantId: guest.tenantId,
        sourceCustomerId: guest.id,
        destinationCustomerId: guest.id,
        confirmed: false,
        actorKind: "staff",
      }),
    (err: Error & { code?: string }) => err.code === "merge_not_confirmed",
  );
});

test("module gate for advanced CRM on tenant without customer_management", async () => {
  const auth = await staffLogin("peak-fitness", "admin@peak.fitness");
  const res = await app.inject({
    method: "GET",
    url: "/tags",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("audit logging for customer actions", async () => {
  const auth = await staffLogin("sunrise-hotel", "crm@sunrise.hotel");
  await app.inject({
    method: "POST",
    url: "/customers",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { displayName: "Audited" },
  });
  const audits = await prisma.auditLog.findMany({
    where: { tenantId: auth.tenantId, action: "customer.created" },
  });
  assert.ok(audits.length >= 1);
});
