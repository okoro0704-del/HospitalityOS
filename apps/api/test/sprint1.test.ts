import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { hashPassword } from "../src/lib/crypto.js";
import { startMockLifeOs, type MockLifeOs } from "./helpers/mock-lifeos.js";
import { clearBookingEngine } from "./helpers/cleanup-booking.js";
import { clearCommerceEngine } from "./helpers/cleanup-commerce.js";
import { clearDiningModule } from "./helpers/cleanup-dining.js";
import { clearFitnessModule } from "./helpers/cleanup-fitness.js";
import type { FastifyInstance } from "fastify";

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
          { moduleId: "restaurant", enabled: true, config: {} },
          { moduleId: "events", enabled: false, config: {} },
        ],
      },
      branches: {
        create: [{ name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC" }],
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
            displayName: "Front Desk",
            email: "desk@sunrise.hotel",
            passwordHash: hashPassword("password123"),
            role: "front_desk",
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
        create: [
          { moduleId: "gym_membership", enabled: true, config: {} },
          { moduleId: "fitness_classes", enabled: true, config: {} },
        ],
      },
      branches: {
        create: [{ name: "Central", code: "MAIN", isPrimary: true, timezone: "UTC" }],
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
            displayName: "Gym Guest",
            email: "guest@peak.test",
            status: "active",
            preferences: {},
            loyaltyPlaceholder: {},
            metadata: {},
          },
        ],
      },
    },
  });

  return { hotel, gym };
}

async function staffLogin(tenantSlug: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string; staff: { id: string; role: string } };
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

test("health endpoint returns ok", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { status: string; service: string };
  assert.equal(body.status, "ok");
  assert.equal(body.service, "hospitalityos-api");
});

test("API validation rejects invalid staff login payload", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: "sunrise-hotel", email: "not-an-email", password: "x" },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json() as { error: string };
  assert.equal(body.error, "validation_error");
});

test("module catalog is available", async () => {
  const res = await app.inject({ method: "GET", url: "/modules/catalog" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { modules: Array<{ id: string }> };
  assert.ok(body.modules.length >= 20);
  assert.ok(body.modules.some((m) => m.id === "accommodation"));
});

test("tenant isolation: staff cannot read another tenant customer", async () => {
  const hotelAuth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const gym = await prisma.tenant.findUniqueOrThrow({ where: { slug: "peak-fitness" } });
  const gymCustomer = await prisma.customer.findFirstOrThrow({ where: { tenantId: gym.id } });

  const res = await app.inject({
    method: "GET",
    url: `/customers/${gymCustomer.id}`,
    headers: { authorization: `Bearer ${hotelAuth.token}` },
  });
  assert.equal(res.statusCode, 404);
  const body = res.json() as { error: string };
  assert.equal(body.error, "not_found");
});

test("tenant isolation: customer list is scoped to authenticated tenant", async () => {
  const hotelAuth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  await prisma.customer.create({
    data: {
      tenantId: hotelAuth.tenantId,
      displayName: "Hotel Guest",
      email: "guest@sunrise.test",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const res = await app.inject({
    method: "GET",
    url: "/customers",
    headers: { authorization: `Bearer ${hotelAuth.token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { customers: Array<{ email?: string | null }> };
  assert.equal(body.customers.length, 1);
  assert.equal(body.customers[0]?.email, "guest@sunrise.test");
});

test("module enable/disable updates tenant registry", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");

  const before = await app.inject({
    method: "GET",
    url: "/tenant/modules",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  const beforeBody = before.json() as {
    modules: Array<{ id: string; enabled: boolean }>;
  };
  const eventsBefore = beforeBody.modules.find((m) => m.id === "events");
  assert.equal(eventsBefore?.enabled, false);

  const enable = await app.inject({
    method: "PUT",
    url: "/tenant/modules/events",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { enabled: true },
  });
  assert.equal(enable.statusCode, 200);

  const after = await app.inject({
    method: "GET",
    url: "/tenant/modules",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  const afterBody = after.json() as {
    modules: Array<{ id: string; enabled: boolean }>;
  };
  assert.equal(afterBody.modules.find((m) => m.id === "events")?.enabled, true);

  const disable = await app.inject({
    method: "PUT",
    url: "/tenant/modules/events",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { enabled: false },
  });
  assert.equal(disable.statusCode, 200);
});

test("unknown module id is rejected", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "PUT",
    url: "/tenant/modules/spaceship_rental",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { enabled: true },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_module");
});

test("role isolation: front_desk cannot manage modules", async () => {
  const auth = await staffLogin("sunrise-hotel", "desk@sunrise.hotel");
  const res = await app.inject({
    method: "PUT",
    url: "/tenant/modules/events",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { enabled: true },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "forbidden");
});

test("role isolation: front_desk cannot list staff", async () => {
  const auth = await staffLogin("sunrise-hotel", "desk@sunrise.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/staff",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 403);
});

test("authentication handoff creates local guest session", async () => {
  const jti = "jti_handoff_ok";
  const token = await mockLifeOs.issueToken({
    sub: "lifeos_user_1",
    aud: "exp_sunrise_hotel",
    experience_id: "exp_sunrise_hotel",
    business_id: "biz_sunrise_hotel",
    display_name: "Ada Guest",
    jti,
    scopes: ["profile.basic", "notifications"],
  });
  mockLifeOs.setHandoff("hof_test_1", "exp_sunrise_hotel", token);

  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff: "hof_test_1", experienceId: "exp_sunrise_hotel" },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as {
    token: string;
    session: { displayName: string; experienceId: string; tenantId: string };
    customer: { displayName: string };
    tenantSlug: string;
  };
  assert.equal(body.session.displayName, "Ada Guest");
  assert.equal(body.tenantSlug, "sunrise-hotel");
  assert.ok(body.token.startsWith("hos_"));

  const me = await app.inject({
    method: "GET",
    url: "/auth/guest/me",
    headers: { authorization: `Bearer ${body.token}` },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().customer.displayName, "Ada Guest");
});

test("authentication handoff rejects wrong experience audience", async () => {
  const token = await mockLifeOs.issueToken({
    sub: "lifeos_user_2",
    aud: "exp_peak_fitness",
    experience_id: "exp_peak_fitness",
    business_id: "biz_peak_fitness",
    jti: "jti_wrong_aud",
  });
  mockLifeOs.setHandoff("hof_wrong", "exp_sunrise_hotel", token);

  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff: "hof_wrong", experienceId: "exp_sunrise_hotel" },
  });
  assert.equal(res.statusCode, 401);
});

test("authentication handoff rejects revoked LifeOS session", async () => {
  const jti = "jti_revoked";
  const token = await mockLifeOs.issueToken({
    sub: "lifeos_user_3",
    aud: "exp_sunrise_hotel",
    experience_id: "exp_sunrise_hotel",
    business_id: "biz_sunrise_hotel",
    jti,
  });
  mockLifeOs.setHandoff("hof_revoked", "exp_sunrise_hotel", token);
  mockLifeOs.revokeJti(jti);

  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff: "hof_revoked", experienceId: "exp_sunrise_hotel" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "revoked");
});

test("public tenant branding endpoint returns configuration model", async () => {
  const res = await app.inject({ method: "GET", url: "/tenants/sunrise-hotel/public" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    tenant: {
      name: string;
      branding: { primaryColor: string };
      enabledModules: string[];
    };
  };
  assert.equal(body.tenant.name, "Sunrise Hotel");
  assert.ok(body.tenant.branding.primaryColor);
  assert.ok(body.tenant.enabledModules.includes("accommodation"));
  assert.ok(!body.tenant.enabledModules.includes("events"));
});
