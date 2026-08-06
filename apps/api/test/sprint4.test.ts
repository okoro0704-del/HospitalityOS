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
          { moduleId: "events", enabled: true, config: {} },
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

  return { hotel, gym, guest };
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
    sub: "lifeos_commerce",
    aud: "exp_sunrise_hotel",
    experience_id: "exp_sunrise_hotel",
    business_id: "biz_sunrise_hotel",
    display_name: "Commerce Guest",
    jti: `jti_c4_${Date.now()}`,
  });
  const handoff = `hof_c4_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_sunrise_hotel", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_sunrise_hotel" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  return exchange.json() as { token: string };
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

test("catalog CRUD: bootstrap and categories", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const boot = await app.inject({
    method: "POST",
    url: "/commerce/bootstrap",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(boot.statusCode, 200, boot.body);
  assert.ok(boot.json().catalog.id);

  const cat = await app.inject({
    method: "POST",
    url: "/commerce/categories",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Wellness", code: "wellness" },
  });
  assert.equal(cat.statusCode, 200, cat.body);

  const nested = await app.inject({
    method: "POST",
    url: "/commerce/categories",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Massage",
      code: "massage",
      parentId: cat.json().category.id,
    },
  });
  assert.equal(nested.statusCode, 200, nested.body);
  assert.equal(nested.json().category.parentId, cat.json().category.id);
});

test("service creation", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  await app.inject({
    method: "POST",
    url: "/commerce/bootstrap",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  const created = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "service",
      name: "Yoga Class",
      code: "YOGA-60",
      basePrice: 40,
      status: "active",
      durationMinutes: 60,
      bookable: true,
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().offering.kind, "service");
});

test("product creation independent of booking", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const created = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "product",
      name: "Coffee",
      code: "COFFEE",
      sku: "COF-1",
      basePrice: 4.5,
      status: "active",
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  assert.equal(created.json().offering.kind, "product");
  const detail = await prisma.productDetail.findFirst({
    where: { offeringId: created.json().offering.id },
  });
  assert.ok(detail);
  assert.equal(detail!.sku, "COF-1");
});

test("package composition", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const service = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { kind: "service", name: "Stay", code: "STAY", basePrice: 100, status: "active" },
  });
  const product = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "product",
      name: "Breakfast",
      code: "BFST",
      sku: "BF-1",
      basePrice: 20,
      status: "active",
    },
  });
  const pkg = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "package",
      name: "Room + Breakfast",
      code: "RB-PKG",
      bundlePrice: 110,
      basePrice: 110,
      status: "active",
      packageItems: [
        { childOfferingId: service.json().offering.id, required: true },
        { childOfferingId: product.json().offering.id, required: true },
      ],
    },
  });
  assert.equal(pkg.statusCode, 200, pkg.body);
  const items = await prisma.packageItem.findMany({
    where: { packageOfferingId: pkg.json().offering.id },
  });
  assert.equal(items.length, 2);
});

test("pricing calculations with coupon", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const offering = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "product",
      name: "Merch",
      code: "MERCH",
      sku: "M-1",
      basePrice: 100,
      status: "active",
    },
  });
  const promo = await app.inject({
    method: "POST",
    url: "/commerce/promotions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Ten off", code: "TEN", kind: "percent", percent: 10 },
  });
  assert.equal(promo.statusCode, 200, promo.body);
  await app.inject({
    method: "POST",
    url: "/commerce/coupons",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { code: "TEN", promotionId: promo.json().promotion.id },
  });

  const quote = await app.inject({
    method: "POST",
    url: "/commerce/pricing/quote",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { offeringId: offering.json().offering.id, couponCode: "TEN" },
  });
  assert.equal(quote.statusCode, 200, quote.body);
  assert.equal(quote.json().quote.discountAmount, 10);
  assert.equal(quote.json().quote.total, 90);
});

test("promotion and coupon validation", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const promo = await app.inject({
    method: "POST",
    url: "/commerce/promotions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Flash", code: "FLASH5", kind: "fixed", amount: 5 },
  });
  await app.inject({
    method: "POST",
    url: "/commerce/coupons",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { code: "FLASH5", promotionId: promo.json().promotion.id },
  });
  const ok = await app.inject({
    method: "POST",
    url: "/commerce/coupons/validate",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { code: "flash5" },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().valid, true);

  const bad = await app.inject({
    method: "POST",
    url: "/commerce/coupons/validate",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { code: "NOPE" },
  });
  assert.equal(bad.statusCode, 400);
});

test("booking integration for services with availability links", async () => {
  const seed = await resetDb();
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  await app.inject({
    method: "POST",
    url: "/booking/bootstrap",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  const cats = await app.inject({
    method: "GET",
    url: "/booking/categories",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  const events = (cats.json().categories as Array<{ id: string; code: string }>).find(
    (c) => c.code === "events",
  )!;
  const resource = await app.inject({
    method: "POST",
    url: "/booking/resources",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Studio A",
      code: `STU-${Date.now()}`,
      categoryId: events.id,
      moduleId: "events",
      capacity: 1,
    },
  });
  assert.equal(resource.statusCode, 200, resource.body);

  const service = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "service",
      name: "Studio Session",
      code: `SS-${Date.now()}`,
      basePrice: 55,
      status: "active",
      bookable: true,
      bookableResourceIds: [resource.json().resource.id],
      moduleId: "events",
    },
  });
  assert.equal(service.statusCode, 200, service.body);

  const booked = await app.inject({
    method: "POST",
    url: `/commerce/services/${service.json().offering.id}/book`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      customerId: seed.guest.id,
      startsAt: "2026-10-01T10:00:00.000Z",
      endsAt: "2026-10-01T11:00:00.000Z",
    },
  });
  assert.equal(booked.statusCode, 200, booked.body);
  assert.ok(booked.json().booking.id);
});

test("tenant isolation on offerings", async () => {
  const hotelAuth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const created = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${hotelAuth.token}` },
    payload: {
      kind: "product",
      name: "Hotel Merch",
      code: "HM-1",
      sku: "HM-1",
      basePrice: 15,
      status: "active",
    },
  });
  const offeringId = created.json().offering.id as string;

  const gymAuth = await staffLogin("peak-fitness", "admin@peak.fitness");
  const list = await app.inject({
    method: "GET",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${gymAuth.token}` },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(!list.json().offerings.some((o: { id: string }) => o.id === offeringId));

  const get = await app.inject({
    method: "GET",
    url: `/commerce/offerings/${offeringId}`,
    headers: { authorization: `Bearer ${gymAuth.token}` },
  });
  assert.equal(get.statusCode, 404);
});

test("authorization: viewer cannot create offerings", async () => {
  const auth = await staffLogin("sunrise-hotel", "viewer@sunrise.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "product",
      name: "X",
      code: "X",
      sku: "X",
      basePrice: 1,
    },
  });
  assert.equal(res.statusCode, 403);
});

test("API validation rejects invalid offering payload", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { kind: "service" },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});

test("guest can browse catalog and validate coupon", async () => {
  const auth = await staffLogin("sunrise-hotel", "admin@sunrise.hotel");
  await app.inject({
    method: "POST",
    url: "/commerce/offerings",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      kind: "product",
      name: "Guest Water",
      code: "GW-1",
      sku: "GW-1",
      basePrice: 3,
      status: "active",
      visibility: "public",
    },
  });
  const promo = await app.inject({
    method: "POST",
    url: "/commerce/promotions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Guest save", code: "GUEST10", kind: "percent", percent: 10 },
  });
  await app.inject({
    method: "POST",
    url: "/commerce/coupons",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { code: "GUEST10", promotionId: promo.json().promotion.id },
  });

  const guest = await guestLogin();
  const browse = await app.inject({
    method: "GET",
    url: "/guest/commerce/offerings",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(browse.statusCode, 200);
  assert.ok(browse.json().offerings.length >= 1);

  const coupon = await app.inject({
    method: "POST",
    url: "/guest/commerce/coupons/validate",
    headers: { authorization: `Bearer ${guest.token}` },
    payload: { code: "GUEST10" },
  });
  assert.equal(coupon.statusCode, 200);
  assert.equal(coupon.json().valid, true);
});
