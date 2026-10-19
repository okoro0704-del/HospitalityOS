/**
 * Wave F — API-authoritative branch isolation for accommodation + dining.
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
import { hashPassword } from "../src/lib/crypto.js";
import { clearDiningModule } from "./helpers/cleanup-dining.js";
import { clearBillingModule } from "./helpers/cleanup-billing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

let app: FastifyInstance;
const prisma = new PrismaClient();
const hours = [
  { day: "mon", open: "09:00", close: "17:00", closed: false },
  { day: "tue", open: "09:00", close: "17:00", closed: false },
];

const MODULES = ["accommodation", "restaurant", "billing"] as const;

let branchAId = "";
let branchBId = "";

async function resetDb() {
  await clearDiningModule(prisma);
  await clearBillingModule(prisma);
  await prisma.reservationTimeline.deleteMany().catch(() => undefined);
  await prisma.reservationGuest.deleteMany().catch(() => undefined);
  await prisma.stay.deleteMany().catch(() => undefined);
  await prisma.accommodationReservation.deleteMany().catch(() => undefined);
  await prisma.room.deleteMany().catch(() => undefined);
  await prisma.roomTypeAmenity.deleteMany().catch(() => undefined);
  await prisma.roomType.deleteMany().catch(() => undefined);
  await prisma.amenity.deleteMany().catch(() => undefined);
  await prisma.floor.deleteMany().catch(() => undefined);
  await prisma.building.deleteMany().catch(() => undefined);
  await prisma.property.deleteMany().catch(() => undefined);
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
    data: { slug: "org-wave-f", name: "Wave F Org", status: "active", metadata: {} },
  });

  const tenant = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "wavef-hotel",
      name: "Wave F Hotel",
      businessType: "hotel",
      experienceId: "exp_wave_f",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: MODULES.map((moduleId) => ({ moduleId, enabled: true, config: {} })),
      },
    },
  });

  const branchA = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Branch A", code: "A", isPrimary: true, timezone: "UTC" },
  });
  const branchB = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Branch B", code: "B", isPrimary: false, timezone: "UTC" },
  });
  branchAId = branchA.id;
  branchBId = branchB.id;

  const pw = hashPassword("password123");
  await prisma.staffMember.createMany({
    data: [
      {
        tenantId: tenant.id,
        email: "admin@wavef.hotel",
        displayName: "Admin",
        role: "admin",
        passwordHash: pw,
        branchIds: [],
      },
      {
        tenantId: tenant.id,
        email: "desk-a@wavef.hotel",
        displayName: "Desk A",
        role: "front_desk",
        passwordHash: pw,
        branchIds: [branchA.id],
      },
    ],
  });
  await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      displayName: "Guest",
      email: "guest@wavef.hotel",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { tenant, branchA, branchB };
}

async function staffLogin(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: "wavef-hotel", email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; staff: { id: string } };
}

before(async () => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  app = await buildApp();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

test("Wave F: branch-scoped front_desk cannot list other branch properties", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavef-hotel" } });
  await prisma.property.create({
    data: {
      tenantId: tenant.id,
      branchId: branchBId,
      name: "Property B",
      code: "PB",
      propertyType: "hotel",
      status: "active",
    },
  });
  await prisma.property.create({
    data: {
      tenantId: tenant.id,
      branchId: branchAId,
      name: "Property A",
      code: "PA",
      propertyType: "hotel",
      status: "active",
    },
  });

  const desk = await staffLogin("desk-a@wavef.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/accommodation/properties",
    headers: { authorization: `Bearer ${desk.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const properties = (
    list.json() as { properties: Array<{ branchId: string | null; code: string }> }
  ).properties;
  assert.equal(properties.length, 1);
  assert.equal(properties[0].code, "PA");
  assert.equal(properties[0].branchId, branchAId);
});

test("Wave F: branch-scoped front_desk cannot list other branch dining areas", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavef-hotel" } });
  await prisma.diningArea.create({
    data: {
      tenantId: tenant.id,
      branchId: branchBId,
      name: "Area B",
      code: "AB",
      metadata: {},
      status: "active",
    },
  });
  await prisma.diningArea.create({
    data: {
      tenantId: tenant.id,
      branchId: branchAId,
      name: "Area A",
      code: "AA",
      metadata: {},
      status: "active",
    },
  });

  const desk = await staffLogin("desk-a@wavef.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/dining/areas",
    headers: { authorization: `Bearer ${desk.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const areas = (list.json() as { areas: Array<{ branchId: string | null; code: string }> }).areas;
  assert.equal(areas.length, 1);
  assert.equal(areas[0].code, "AA");
  assert.equal(areas[0].branchId, branchAId);
});

test("Wave F: branch-scoped front_desk cannot list other branch dining orders", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavef-hotel" } });
  await prisma.diningOrder.create({
    data: {
      tenantId: tenant.id,
      branchId: branchBId,
      orderType: "dine_in",
      status: "submitted",
      subtotal: 1000,
      serviceCharge: 0,
      taxAmount: 0,
      total: 1000,
    },
  });
  await prisma.diningOrder.create({
    data: {
      tenantId: tenant.id,
      branchId: branchAId,
      orderType: "dine_in",
      status: "submitted",
      subtotal: 2000,
      serviceCharge: 0,
      taxAmount: 0,
      total: 2000,
    },
  });

  const desk = await staffLogin("desk-a@wavef.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/dining/orders",
    headers: { authorization: `Bearer ${desk.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const orders = (list.json() as { orders: Array<{ branchId: string | null; total: number }> }).orders;
  assert.equal(orders.length, 1);
  assert.equal(orders[0].branchId, branchAId);
  assert.equal(orders[0].total, 2000);
});
