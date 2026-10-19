/**
 * Wave B — Operations Today / command center.
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
import { resolveStaffCommand } from "../src/services/operations-today.js";
import { resetRateLimits } from "../src/lib/rate-limit.js";
import { clearBillingModule } from "./helpers/cleanup-billing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

let app: FastifyInstance;
const prisma = new PrismaClient();
const hours = [{ day: "mon", open: "09:00", close: "17:00", closed: false }];

async function resetDb() {
  await clearBillingModule(prisma);
  await prisma.notification.deleteMany().catch(() => undefined);
  await prisma.reorderAlert.deleteMany().catch(() => undefined);
  await prisma.operationalTask.deleteMany().catch(() => undefined);
  await prisma.maintenanceRecord.deleteMany().catch(() => undefined);
  await prisma.accommodationReservation.deleteMany().catch(() => undefined);
  await prisma.room.deleteMany().catch(() => undefined);
  await prisma.roomType.deleteMany().catch(() => undefined);
  await prisma.property.deleteMany().catch(() => undefined);
  await prisma.booking.deleteMany().catch(() => undefined);
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
    data: { slug: "org-wave-b", name: "Wave B Org", status: "active", metadata: {} },
  });

  const hotel = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "waveb-hotel",
      name: "Wave B Hotel",
      businessType: "hotel",
      experienceId: "exp_wave_b",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "accommodation", enabled: true, config: {} },
          { moduleId: "billing", enabled: true, config: {} },
          { moduleId: "inventory", enabled: true, config: {} },
          { moduleId: "customer_management", enabled: true, config: {} },
        ],
      },
    },
  });

  const lagos = await prisma.branch.create({
    data: { tenantId: hotel.id, name: "Lagos", code: "LOS", isPrimary: true, timezone: "UTC" },
  });
  const abuja = await prisma.branch.create({
    data: { tenantId: hotel.id, name: "Abuja", code: "ABJ", isPrimary: false, timezone: "UTC" },
  });

  await prisma.staffMember.createMany({
    data: [
      {
        tenantId: hotel.id,
        displayName: "Admin",
        email: "admin@waveb.hotel",
        passwordHash: hashPassword("password123"),
        role: "admin",
        branchIds: [],
      },
      {
        tenantId: hotel.id,
        displayName: "Lagos Desk",
        email: "lagos@waveb.hotel",
        passwordHash: hashPassword("password123"),
        role: "front_desk",
        branchIds: [lagos.id],
      },
      {
        tenantId: hotel.id,
        displayName: "Kitchen",
        email: "kitchen@waveb.hotel",
        passwordHash: hashPassword("password123"),
        role: "kitchen",
        branchIds: [],
      },
    ],
  });

  const guest = await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Ada Guest",
      email: "ada@waveb.hotel",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const property = await prisma.property.create({
    data: {
      tenantId: hotel.id,
      name: "Main",
      code: "MAIN",
      propertyType: "hotel",
      status: "active",
    },
  });
  const roomType = await prisma.roomType.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      name: "Standard",
      code: "STD",
      capacity: 2,
      photoUrls: [],
      status: "active",
    },
  });
  await prisma.room.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      roomTypeId: roomType.id,
      number: "101",
      housekeepingStatus: "dirty",
      maintenanceStatus: "available",
    },
  });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  await prisma.accommodationReservation.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      roomTypeId: roomType.id,
      customerId: guest.id,
      status: "confirmed",
      checkInDate: start,
      checkOutDate: end,
      confirmationCode: "ARR-WB-1",
      adults: 1,
    },
  });

  await prisma.invoice.create({
    data: {
      tenantId: hotel.id,
      customerId: guest.id,
      number: "INV-WB-1",
      currency: "NGN",
      status: "open",
      subtotal: 5000,
      taxTotal: 0,
      discountTotal: 0,
      total: 5000,
      amountPaid: 0,
      amountDue: 5000,
      metadata: {},
    },
  });

  await prisma.payment.create({
    data: {
      tenantId: hotel.id,
      customerId: guest.id,
      amount: 2000,
      currency: "NGN",
      provider: "manual",
      status: "pending_verification",
      methodType: "bank_transfer_manual",
      branchId: lagos.id,
      metadata: {},
      idempotencyKey: "wb_verify_1",
    },
  });

  await prisma.reorderAlert.create({
    data: {
      tenantId: hotel.id,
      itemId: "item_placeholder",
      onHand: 1,
      reorderPoint: 5,
      status: "open",
    },
  });

  await prisma.operationalTask.create({
    data: {
      tenantId: hotel.id,
      title: "Restock minibar",
      status: "open",
      priority: "medium",
      dueAt: new Date(Date.now() - 3600_000),
    },
  });

  return { hotel, lagos, abuja, guest };
}

async function staffLogin(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: "waveb-hotel", email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string };
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

beforeEach(async () => {
  resetRateLimits();
  await resetDb();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test("today aggregation returns sections and attention", async () => {
  const auth = await staffLogin("admin@waveb.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/operations/today",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200, res.body);
  const today = res.json().today;
  assert.ok(Array.isArray(today.sections));
  assert.ok(today.sections.some((s: { id: string }) => s.id === "arrivals"));
  assert.ok(today.sections.some((s: { id: string }) => s.id === "pending_payments"));
  assert.ok(today.attention.some((a: { id: string }) => a.id.startsWith("stock_") || a.id.startsWith("task_")));
  assert.ok(today.quickActions.length > 0);
});

test("kitchen today omits payment sections", async () => {
  const auth = await staffLogin("kitchen@waveb.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/operations/today",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200, res.body);
  const ids = res.json().today.sections.map((s: { id: string }) => s.id);
  assert.ok(!ids.includes("pending_payments"));
  assert.ok(!ids.includes("payment_verification"));
  const actions = res.json().today.quickActions.map((a: { id: string }) => a.id);
  assert.ok(!actions.includes("collect_payment"));
});

test("branch isolation rejects unauthorized branchId on today", async () => {
  const abuja = await prisma.branch.findFirstOrThrow({ where: { code: "ABJ" } });
  const auth = await staffLogin("lagos@waveb.hotel");
  const res = await app.inject({
    method: "GET",
    url: `/operations/today?branchId=${abuja.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 403);
});

test("tenant isolation: other tenant token cannot read hotel today", async () => {
  const other = await prisma.tenant.create({
    data: {
      slug: "waveb-other",
      name: "Other",
      businessType: "gym",
      experienceId: "exp_other_b",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: { create: [{ moduleId: "billing", enabled: true, config: {} }] },
      staff: {
        create: [
          {
            displayName: "Other Admin",
            email: "admin@other.waveb",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: "waveb-other", email: "admin@other.waveb", password: "password123" },
  });
  assert.equal(login.statusCode, 200, login.body);
  const res = await app.inject({
    method: "GET",
    url: "/operations/today",
    headers: { authorization: `Bearer ${login.json().token}` },
  });
  assert.equal(res.statusCode, 200);
  const arrivals = res.json().today.sections.find((s: { id: string }) => s.id === "arrivals");
  // Other tenant has no accommodation module — arrivals section absent
  assert.equal(arrivals, undefined);
  void other;
});

test("command resolver is deterministic", () => {
  const a = resolveStaffCommand("Show today's arrivals");
  assert.equal(a.matched, true);
  assert.deepEqual(a.sectionIds, ["arrivals"]);
  const b = resolveStaffCommand("Payments awaiting verification");
  assert.equal(b.matched, true);
  assert.ok(b.sectionIds.includes("payment_verification"));
  const c = resolveStaffCommand("xyzzy unknown");
  assert.equal(c.matched, false);
});

test("command endpoint returns matched sections", async () => {
  const auth = await staffLogin("admin@waveb.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/operations/command",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { query: "low stock" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().command.matched, true);
  assert.deepEqual(res.json().command.sectionIds, ["low_stock"]);
});

test("search is permission scoped", async () => {
  const auth = await staffLogin("admin@waveb.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/operations/search?q=Ada",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().results.some((r: { type: string }) => r.type === "customer"));

  const kitchen = await staffLogin("kitchen@waveb.hotel");
  const deny = await app.inject({
    method: "GET",
    url: "/operations/search?q=INV-WB",
    headers: { authorization: `Bearer ${kitchen.token}` },
  });
  assert.equal(deny.statusCode, 200);
  assert.ok(!deny.json().results.some((r: { type: string }) => r.type === "invoice"));
});

test("overview returns derived metrics", async () => {
  const auth = await staffLogin("admin@waveb.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/operations/overview",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().overview.metrics.length >= 1);
  assert.ok(res.json().overview.disclaimer.includes("transactional"));
});

test("settings hub is permission filtered", async () => {
  const admin = await staffLogin("admin@waveb.hotel");
  const adminRes = await app.inject({
    method: "GET",
    url: "/staff/settings",
    headers: { authorization: `Bearer ${admin.token}` },
  });
  assert.equal(adminRes.statusCode, 200);
  assert.ok(adminRes.json().sections.some((s: { id: string }) => s.id === "branding"));

  const desk = await staffLogin("lagos@waveb.hotel");
  const deskRes = await app.inject({
    method: "GET",
    url: "/staff/settings",
    headers: { authorization: `Bearer ${desk.token}` },
  });
  assert.equal(deskRes.statusCode, 200);
  assert.ok(!deskRes.json().sections.some((s: { id: string }) => s.id === "branding"));
});

test("branding settings mutation is audited", async () => {
  const auth = await staffLogin("admin@waveb.hotel");
  const res = await app.inject({
    method: "PATCH",
    url: "/tenant/branding",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { primaryColor: "#114455" },
  });
  assert.equal(res.statusCode, 200, res.body);
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: auth.tenantId, action: "tenant.branding.update" },
  });
  assert.ok(logs.length >= 1);
});

test("empty day sections remain ok with zero items", async () => {
  await prisma.accommodationReservation.deleteMany();
  const auth = await staffLogin("admin@waveb.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/operations/today",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200);
  const arrivals = res.json().today.sections.find((s: { id: string }) => s.id === "arrivals");
  assert.ok(arrivals);
  assert.equal(arrivals.ok, true);
  assert.equal(arrivals.count, 0);
});
