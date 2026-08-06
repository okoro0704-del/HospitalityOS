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
  postInventoryTransaction,
  transferStock,
} from "../src/services/operations.js";
import { createOffering, ensureDefaultCatalog } from "../src/services/commerce-engine.js";

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
      experienceId: "exp_sunrise_ops",
      lifeosBusinessId: "biz_sunrise_ops",
      primaryColor: "#0F766E",
      secondaryColor: "#134E4A",
      accentColor: "#F59E0B",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "inventory", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Ops Admin",
            email: "ops@sunrise.hotel",
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

  await prisma.tenant.create({
    data: {
      slug: "peak-fitness",
      name: "Peak Fitness",
      businessType: "gym",
      experienceId: "exp_peak_no_inv",
      lifeosBusinessId: "biz_peak_no_inv",
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
            email: "ops@peak.fitness",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });

  return { hotel };
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

async function seedStock(auth: { token: string; tenantId: string }) {
  const loc = await app.inject({
    method: "POST",
    url: "/operations/locations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Main Store", code: `MS-${Date.now()}` },
  });
  assert.equal(loc.statusCode, 201, loc.body);
  const kitchen = await app.inject({
    method: "POST",
    url: "/operations/locations",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Kitchen",
      code: `K-${Date.now()}`,
      parentId: loc.json().location.id,
    },
  });
  assert.equal(kitchen.statusCode, 201, kitchen.body);
  const item = await app.inject({
    method: "POST",
    url: "/operations/items",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      name: "Towels",
      sku: `SKU-${Date.now()}`,
      unit: "piece",
      reorderPoint: 5,
    },
  });
  assert.equal(item.statusCode, 201, item.body);
  return {
    location: loc.json().location,
    kitchen: kitchen.json().location,
    item: item.json().item,
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

after(async () => {
  await app.close();
  await mockLifeOs.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

test("module gate: gym without inventory cannot access operations APIs", async () => {
  const auth = await staffLogin("peak-fitness", "ops@peak.fitness");
  const res = await app.inject({
    method: "GET",
    url: "/operations/locations",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "module_disabled");
});

test("inventory locations and items CRUD", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  assert.ok(seeded.location.id);
  assert.ok(seeded.item.sku);

  const list = await app.inject({
    method: "GET",
    url: "/operations/items",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().items.length >= 1);
});

test("stock balances via transactional receipt", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  const tx = await app.inject({
    method: "POST",
    url: "/operations/transactions",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      itemId: seeded.item.id,
      locationId: seeded.location.id,
      type: "receipt",
      quantity: 50,
      direction: "in",
    },
  });
  assert.equal(tx.statusCode, 201, tx.body);
  assert.equal(tx.json().balanceAfter.onHandAfter, 50);

  const stock = await app.inject({
    method: "GET",
    url: "/operations/stock",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(stock.statusCode, 200);
  assert.ok(stock.json().balances.some((b: { available: number }) => b.available === 50));
});

test("negative inventory protection", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  await postInventoryTransaction({
    tenantId: auth.tenantId,
    itemId: seeded.item.id,
    locationId: seeded.location.id,
    type: "receipt",
    quantity: 2,
    direction: "in",
    actorKind: "system",
  });
  await assert.rejects(
    () =>
      postInventoryTransaction({
        tenantId: auth.tenantId,
        itemId: seeded.item.id,
        locationId: seeded.location.id,
        type: "consumption",
        quantity: 5,
        direction: "out",
        actorKind: "system",
      }),
    (err: Error & { code?: string }) => err.code === "insufficient_stock",
  );
});

test("concurrent stock mutations allow only valid total", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  await postInventoryTransaction({
    tenantId: auth.tenantId,
    itemId: seeded.item.id,
    locationId: seeded.location.id,
    type: "receipt",
    quantity: 1,
    direction: "in",
    actorKind: "system",
  });

  const results = await Promise.allSettled([
    postInventoryTransaction({
      tenantId: auth.tenantId,
      itemId: seeded.item.id,
      locationId: seeded.location.id,
      type: "consumption",
      quantity: 1,
      direction: "out",
      actorKind: "system",
    }),
    postInventoryTransaction({
      tenantId: auth.tenantId,
      itemId: seeded.item.id,
      locationId: seeded.location.id,
      type: "consumption",
      quantity: 1,
      direction: "out",
      actorKind: "system",
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);

  const bal = await prisma.inventoryBalance.findFirstOrThrow({
    where: { tenantId: auth.tenantId, itemId: seeded.item.id, locationId: seeded.location.id },
  });
  assert.equal(bal.available, 0);
});

test("transfers move stock between locations", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  await postInventoryTransaction({
    tenantId: auth.tenantId,
    itemId: seeded.item.id,
    locationId: seeded.location.id,
    type: "receipt",
    quantity: 20,
    direction: "in",
    actorKind: "system",
  });
  const move = await transferStock({
    tenantId: auth.tenantId,
    itemId: seeded.item.id,
    fromLocationId: seeded.location.id,
    toLocationId: seeded.kitchen.id,
    quantity: 8,
    reason: "Restock kitchen",
    actorKind: "system",
  });
  assert.ok(move.movement.id);

  const src = await prisma.inventoryBalance.findFirstOrThrow({
    where: { itemId: seeded.item.id, locationId: seeded.location.id },
  });
  const dst = await prisma.inventoryBalance.findFirstOrThrow({
    where: { itemId: seeded.item.id, locationId: seeded.kitchen.id },
  });
  assert.equal(src.onHand, 12);
  assert.equal(dst.onHand, 8);
});

test("stock counts generate adjustment transactions", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  await postInventoryTransaction({
    tenantId: auth.tenantId,
    itemId: seeded.item.id,
    locationId: seeded.location.id,
    type: "receipt",
    quantity: 10,
    direction: "in",
    actorKind: "system",
  });

  const count = await app.inject({
    method: "POST",
    url: "/operations/counts",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { locationId: seeded.location.id, name: "Cycle count" },
  });
  assert.equal(count.statusCode, 201, count.body);
  const line = count.json().count.items[0];
  await app.inject({
    method: "POST",
    url: `/operations/counts/${count.json().count.id}/items`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { itemId: line.itemId, actualQty: 7 },
  });
  const submit = await app.inject({
    method: "POST",
    url: `/operations/counts/${count.json().count.id}/submit`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(submit.statusCode, 200, submit.body);

  const bal = await prisma.inventoryBalance.findFirstOrThrow({
    where: { itemId: seeded.item.id, locationId: seeded.location.id },
  });
  assert.equal(bal.onHand, 7);

  const adj = await prisma.inventoryTransaction.findFirst({
    where: { tenantId: auth.tenantId, type: "stock_count" },
  });
  assert.ok(adj);
});

test("reorder alerts when stock hits reorder point", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  await app.inject({
    method: "POST",
    url: "/operations/reorder-rules",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      itemId: seeded.item.id,
      locationId: seeded.location.id,
      reorderPoint: 5,
      reorderQuantity: 20,
    },
  });
  await postInventoryTransaction({
    tenantId: auth.tenantId,
    itemId: seeded.item.id,
    locationId: seeded.location.id,
    type: "receipt",
    quantity: 6,
    direction: "in",
    actorKind: "system",
  });
  await postInventoryTransaction({
    tenantId: auth.tenantId,
    itemId: seeded.item.id,
    locationId: seeded.location.id,
    type: "consumption",
    quantity: 2,
    direction: "out",
    actorKind: "system",
  });
  const alerts = await app.inject({
    method: "GET",
    url: "/operations/reorder-alerts",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(alerts.statusCode, 200);
  assert.ok(alerts.json().alerts.some((a: { status: string }) => a.status === "open"));
});

test("suppliers and purchase requests", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  const supplier = await app.inject({
    method: "POST",
    url: "/operations/suppliers",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Supply Co", code: `SUP-${Date.now()}`, email: "a@b.com" },
  });
  assert.equal(supplier.statusCode, 201, supplier.body);

  const pr = await app.inject({
    method: "POST",
    url: "/operations/purchase-requests",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      supplierId: supplier.json().supplier.id,
      items: [{ itemId: seeded.item.id, quantity: 25 }],
    },
  });
  assert.equal(pr.statusCode, 201, pr.body);
  assert.equal(pr.json().request.status, "draft");

  const approved = await app.inject({
    method: "PATCH",
    url: `/operations/purchase-requests/${pr.json().request.id}/status`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { status: "approved" },
  });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().request.status, "approved");
});

test("assets, maintenance, and operational tasks", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const asset = await app.inject({
    method: "POST",
    url: "/operations/assets",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: "Cart", code: `A-${Date.now()}` },
  });
  assert.equal(asset.statusCode, 201, asset.body);

  const maint = await app.inject({
    method: "POST",
    url: "/operations/maintenance",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { assetId: asset.json().asset.id, issue: "Wheel broken", priority: "high" },
  });
  assert.equal(maint.statusCode, 201, maint.body);

  const task = await app.inject({
    method: "POST",
    url: "/operations/tasks",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { title: "Inspect cart", relatedEntityType: "asset", relatedEntityId: asset.json().asset.id },
  });
  assert.equal(task.statusCode, 201, task.body);
});

test("commerce product can optionally link inventory item", async () => {
  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  const seeded = await seedStock(auth);
  await ensureDefaultCatalog(auth.tenantId);
  const offering = await createOffering({
    tenantId: auth.tenantId,
    kind: "product",
    name: "Retail Towel",
    code: `P-${Date.now()}`,
    basePrice: 15,
    status: "active",
    visibility: "public",
    sku: "RTL-TWL",
    unit: "piece",
    actorKind: "system",
  });
  const link = await app.inject({
    method: "POST",
    url: "/operations/commerce-link",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { offeringId: offering.id, inventoryItemId: seeded.item.id },
  });
  assert.equal(link.statusCode, 200, link.body);
  assert.equal(link.json().productDetail.inventoryItemId, seeded.item.id);
});

test("authorization and audit logging", async () => {
  const viewer = await staffLogin("sunrise-hotel", "viewer@sunrise.hotel");
  const denied = await app.inject({
    method: "POST",
    url: "/operations/locations",
    headers: { authorization: `Bearer ${viewer.token}` },
    payload: { name: "X", code: "X" },
  });
  assert.equal(denied.statusCode, 403);

  const auth = await staffLogin("sunrise-hotel", "ops@sunrise.hotel");
  await seedStock(auth);
  const audits = await prisma.auditLog.findMany({
    where: { tenantId: auth.tenantId, action: { startsWith: "inventory_" } },
  });
  assert.ok(audits.length >= 1);
});
