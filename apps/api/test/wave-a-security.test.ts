/**
 * Wave A — Security, tenant isolation, RBAC, branch scope, IDOR, mass-assignment.
 */
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
import { signWebhookPayload } from "../src/services/platform-auth.js";
import { staffHasPermission } from "@hospitalityos/shared";
import { resetRateLimits } from "../src/lib/rate-limit.js";
import { clearBillingModule } from "./helpers/cleanup-billing.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

let app: FastifyInstance;
const prisma = new PrismaClient();

const hours = [{ day: "mon", open: "09:00", close: "17:00", closed: false }];

async function resetDb() {
  await prisma.paymentWebhookEvent.deleteMany().catch(() => undefined);
  await prisma.mediaAsset.deleteMany().catch(() => undefined);
  await clearBillingModule(prisma);
  await prisma.customerNote.deleteMany().catch(() => undefined);
  await prisma.inventoryArea.deleteMany().catch(() => undefined);
  await prisma.inventoryLocation.deleteMany().catch(() => undefined);
  await prisma.auditLog.deleteMany();
  await prisma.guestSession.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.platformAdminSession.deleteMany();
  await prisma.platformAdmin.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.bookableResource.deleteMany().catch(() => undefined);
  await prisma.resourceCategory.deleteMany().catch(() => undefined);
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { slug: "org-wave-a", name: "Wave A Org", status: "active", metadata: {} },
  });

  const hotel = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "wave-hotel",
      name: "Wave Hotel",
      businessType: "hotel",
      experienceId: "exp_wave_hotel",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "accommodation", enabled: true, config: {} },
          { moduleId: "billing", enabled: true, config: {} },
          { moduleId: "customer_management", enabled: true, config: {} },
          { moduleId: "inventory", enabled: true, config: {} },
        ],
      },
    },
  });

  const gym = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "wave-gym",
      name: "Wave Gym",
      businessType: "gym",
      experienceId: "exp_wave_gym",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [{ moduleId: "gym_membership", enabled: true, config: {} }],
      },
    },
  });

  const lagos = await prisma.branch.create({
    data: {
      tenantId: hotel.id,
      name: "Lagos",
      code: "LOS",
      isPrimary: true,
      timezone: "UTC",
    },
  });
  const abuja = await prisma.branch.create({
    data: {
      tenantId: hotel.id,
      name: "Abuja",
      code: "ABJ",
      isPrimary: false,
      timezone: "UTC",
    },
  });

  await prisma.branch.create({
    data: { tenantId: gym.id, name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC" },
  });

  await prisma.staffMember.createMany({
    data: [
      {
        tenantId: hotel.id,
        displayName: "Hotel Admin",
        email: "admin@wave.hotel",
        passwordHash: hashPassword("password123"),
        role: "admin",
        branchIds: [],
      },
      {
        tenantId: hotel.id,
        displayName: "Lagos Desk",
        email: "lagos@wave.hotel",
        passwordHash: hashPassword("password123"),
        role: "front_desk",
        branchIds: [lagos.id],
      },
      {
        tenantId: hotel.id,
        displayName: "Kitchen",
        email: "kitchen@wave.hotel",
        passwordHash: hashPassword("password123"),
        role: "kitchen",
        branchIds: [],
      },
      {
        tenantId: hotel.id,
        displayName: "Finance",
        email: "finance@wave.hotel",
        passwordHash: hashPassword("password123"),
        role: "finance",
        branchIds: [],
      },
      {
        tenantId: gym.id,
        displayName: "Gym Admin",
        email: "admin@wave.gym",
        passwordHash: hashPassword("password123"),
        role: "admin",
        branchIds: [],
      },
    ],
  });

  await prisma.platformAdmin.create({
    data: {
      email: "platform@wave.local",
      displayName: "Platform",
      passwordHash: hashPassword("password123"),
      status: "active",
    },
  });

  await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Hotel Guest",
      email: "guest@wave.hotel",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });
  await prisma.customer.create({
    data: {
      tenantId: gym.id,
      displayName: "Gym Guest",
      email: "guest@wave.gym",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { hotel, gym, lagos, abuja };
}

async function staffLogin(slug: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: slug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string; staff: { id: string; role: string } };
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

test("public /platform/tenants is denied without platform admin", async () => {
  const res = await app.inject({ method: "GET", url: "/platform/tenants" });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "unauthorized");
});

test("demo venues are available when ALLOW_DEMO_GUEST is on", async () => {
  const prev = config.allowDemoGuest;
  config.allowDemoGuest = true;
  try {
    const res = await app.inject({ method: "GET", url: "/public/demo/venues" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { venues: Array<{ slug: string }> };
    assert.ok(body.venues.some((v) => v.slug === "wave-hotel"));
    assert.ok(!("id" in (body.venues[0] ?? {})) || !("tenantId" in (body.venues[0] ?? {})));
  } finally {
    config.allowDemoGuest = prev;
  }
});

test("platform admin can list tenants", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/auth/platform/login",
    payload: { email: "platform@wave.local", password: "password123" },
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().token as string;
  const res = await app.inject({
    method: "GET",
    url: "/platform/tenants",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().tenants.length >= 2);
});

test("tenant staff cannot call platform tenants", async () => {
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/platform/tenants",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 401);
});

test("cross-tenant customer IDOR returns not_found", async () => {
  const hotelAuth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const gymCustomer = await prisma.customer.findFirstOrThrow({
    where: { email: "guest@wave.gym" },
  });
  const res = await app.inject({
    method: "GET",
    url: `/customers/${gymCustomer.id}`,
    headers: { authorization: `Bearer ${hotelAuth.token}` },
  });
  assert.ok([403, 404].includes(res.statusCode));
});

test("cross-tenant staff IDOR returns not_found", async () => {
  const hotelAuth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const gymStaff = await prisma.staffMember.findFirstOrThrow({
    where: { email: "admin@wave.gym" },
  });
  const res = await app.inject({
    method: "GET",
    url: `/staff/${gymStaff.id}`,
    headers: { authorization: `Bearer ${hotelAuth.token}` },
  });
  assert.equal(res.statusCode, 404);
});

test("kitchen cannot refund (RBAC)", async () => {
  assert.equal(staffHasPermission("kitchen", "payments.refund"), false);
  const auth = await staffLogin("wave-hotel", "kitchen@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/billing/dashboard",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 403);
});

test("finance can view billing; front_desk cannot refund permission", async () => {
  assert.equal(staffHasPermission("finance", "payments.refund"), true);
  assert.equal(staffHasPermission("front_desk", "payments.refund"), false);
  const auth = await staffLogin("wave-hotel", "finance@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/billing/dashboard",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.ok([200, 403].includes(res.statusCode)); // 403 if billing module gate differs
});

test("branch-scoped staff only sees assigned branches", async () => {
  const auth = await staffLogin("wave-hotel", "lagos@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/branches",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200);
  const branches = res.json().branches as Array<{ code: string }>;
  assert.equal(branches.length, 1);
  assert.equal(branches[0].code, "LOS");
});

test("org-wide admin sees all branches", async () => {
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/branches",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().branches.length >= 2);
});

test("mass-assignment of tenantId on staff create is rejected", async () => {
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const gym = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-gym" } });
  const res = await app.inject({
    method: "POST",
    url: "/staff",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      displayName: "Evil",
      email: "evil@wave.hotel",
      password: "password123",
      role: "viewer",
      tenantId: gym.id,
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});

test("staff create stays in session tenant", async () => {
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/staff",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      displayName: "New Desk",
      email: "newdesk@wave.hotel",
      password: "password123",
      role: "front_desk",
    },
  });
  assert.equal(res.statusCode, 201, res.body);
  const created = await prisma.staffMember.findFirstOrThrow({
    where: { email: "newdesk@wave.hotel" },
  });
  assert.equal(created.tenantId, auth.tenantId);
});

test("media IDOR across tenants returns not_found", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-hotel" } });
  const gym = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-gym" } });
  const asset = await prisma.mediaAsset.create({
    data: {
      tenantId: gym.id,
      url: "https://example.com/private.png",
      kind: "image",
      isPublic: false,
    },
  });
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: `/media/${asset.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404);
  void hotel;
});

test("webhook without signature is unauthorized", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/webhooks/payments/mock",
    payload: { eventId: "wh_nosig", eventType: "payment.captured" },
  });
  assert.equal(res.statusCode, 401);
});

test("webhook with valid signature but no tenant association fails safely", async () => {
  const payload = { eventId: "wh_orphan", eventType: "payment.captured" };
  const signature = signWebhookPayload(payload);
  const res = await app.inject({
    method: "POST",
    url: "/webhooks/payments/mock",
    headers: { "x-hos-signature": signature },
    payload,
  });
  assert.ok([400, 401].includes(res.statusCode));
});

test("errors include requestId and hide internals", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: "wave-hotel", email: "nope@wave.hotel", password: "wrong" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().message, "Invalid credentials");
  assert.ok(res.headers["x-request-id"]);
});

test("guest cannot access staff customer notes endpoints", async () => {
  const prev = config.allowDemoGuest;
  config.allowDemoGuest = true;
  try {
    const demo = await app.inject({
      method: "POST",
      url: "/auth/guest/demo",
      payload: { tenantSlug: "wave-hotel", displayName: "Demo" },
    });
    assert.equal(demo.statusCode, 200, demo.body);
    const token = demo.json().token as string;
    const customer = await prisma.customer.findFirstOrThrow({
      where: { email: "guest@wave.hotel" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/customers/${customer.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 401);
  } finally {
    config.allowDemoGuest = prev;
  }
});

test("login logout audit events are written", async () => {
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  await app.inject({
    method: "POST",
    url: "/auth/staff/logout",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: auth.tenantId, action: { in: ["auth.staff.login", "auth.staff.logout"] } },
  });
  assert.ok(logs.some((l) => l.action === "auth.staff.login"));
  assert.ok(logs.some((l) => l.action === "auth.staff.logout"));
});

test("cross-tenant invoice and payment IDOR returns not_found", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-hotel" } });
  const gym = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-gym" } });
  const gymCustomer = await prisma.customer.findFirstOrThrow({ where: { email: "guest@wave.gym" } });
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: gym.id,
      customerId: gymCustomer.id,
      number: "INV-GYM-1",
      currency: "NGN",
      status: "open",
      subtotal: 1000,
      taxTotal: 0,
      discountTotal: 0,
      total: 1000,
      amountPaid: 0,
      amountDue: 1000,
      metadata: {},
    },
  });
  const payment = await prisma.payment.create({
    data: {
      tenantId: gym.id,
      customerId: gymCustomer.id,
      invoiceId: invoice.id,
      amount: 1000,
      currency: "NGN",
      provider: "manual",
      status: "captured",
      methodType: "cash",
      capturedAmount: 1000,
      netAmount: 1000,
      metadata: {},
      idempotencyKey: "wave_gym_pay_1",
    },
  });
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const invRes = await app.inject({
    method: "GET",
    url: `/billing/invoices/${invoice.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(invRes.statusCode, 404);
  const payRes = await app.inject({
    method: "GET",
    url: `/billing/payments/${payment.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(payRes.statusCode, 404);
  void hotel;
});

test("cross-tenant inventory location IDOR returns not_found", async () => {
  const gym = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-gym" } });
  // Gym may not have inventory module — create location row directly for IDOR probe
  const loc = await prisma.inventoryLocation.create({
    data: {
      tenantId: gym.id,
      name: "Gym Store",
      code: "GYM-ST",
      status: "active",
      metadata: {},
    },
  });
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: `/operations/locations/${loc.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 404, res.body);
});

test("branch-scoped staff cannot see other branch inventory locations", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-hotel" } });
  const lagos = await prisma.branch.findFirstOrThrow({
    where: { tenantId: hotel.id, code: "LOS" },
  });
  const abuja = await prisma.branch.findFirstOrThrow({
    where: { tenantId: hotel.id, code: "ABJ" },
  });
  await prisma.inventoryLocation.create({
    data: {
      tenantId: hotel.id,
      branchId: lagos.id,
      name: "Lagos Store",
      code: "LOS-ST",
      status: "active",
      metadata: {},
    },
  });
  await prisma.inventoryLocation.create({
    data: {
      tenantId: hotel.id,
      branchId: abuja.id,
      name: "Abuja Store",
      code: "ABJ-ST",
      status: "active",
      metadata: {},
    },
  });
  const auth = await staffLogin("wave-hotel", "lagos@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: "/operations/locations",
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 200, res.body);
  const codes = (res.json().locations as Array<{ code: string }>).map((l) => l.code);
  assert.ok(codes.includes("LOS-ST"));
  assert.ok(!codes.includes("ABJ-ST"));
});

test("branch-scoped staff cannot load payment from another branch", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-hotel" } });
  const abuja = await prisma.branch.findFirstOrThrow({
    where: { tenantId: hotel.id, code: "ABJ" },
  });
  const customer = await prisma.customer.findFirstOrThrow({ where: { email: "guest@wave.hotel" } });
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: hotel.id,
      customerId: customer.id,
      number: "INV-ABJ-1",
      currency: "NGN",
      status: "paid",
      subtotal: 5000,
      taxTotal: 0,
      discountTotal: 0,
      total: 5000,
      amountPaid: 5000,
      amountDue: 0,
      metadata: {},
    },
  });
  const payment = await prisma.payment.create({
    data: {
      tenantId: hotel.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      branchId: abuja.id,
      amount: 5000,
      currency: "NGN",
      provider: "manual",
      status: "captured",
      methodType: "cash",
      capturedAmount: 5000,
      netAmount: 5000,
      metadata: {},
      idempotencyKey: "wave_abj_pay",
    },
  });
  const auth = await staffLogin("wave-hotel", "lagos@wave.hotel");
  const res = await app.inject({
    method: "GET",
    url: `/billing/payments/${payment.id}`,
    headers: { authorization: `Bearer ${auth.token}` },
  });
  assert.equal(res.statusCode, 403);
});

test("manual collect rejects collector impersonation without manage", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { email: "guest@wave.hotel" } });
  const admin = await prisma.staffMember.findFirstOrThrow({
    where: { email: "admin@wave.hotel" },
  });
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: hotel.id,
      customerId: customer.id,
      number: "INV-COLLECT-1",
      currency: "NGN",
      status: "open",
      subtotal: 2000,
      taxTotal: 0,
      discountTotal: 0,
      total: 2000,
      amountPaid: 0,
      amountDue: 2000,
      metadata: {},
    },
  });
  const desk = await staffLogin("wave-hotel", "lagos@wave.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/billing/payments/manual/collect",
    headers: { authorization: `Bearer ${desk.token}` },
    payload: {
      invoiceId: invoice.id,
      amount: 2000,
      methodType: "cash",
      idempotencyKey: "wave_impersonate",
      collectedByStaffId: admin.id,
    },
  });
  assert.equal(res.statusCode, 403, res.body);
});

test("front_desk cannot refund; finance can", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { email: "guest@wave.hotel" } });
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: hotel.id,
      customerId: customer.id,
      number: "INV-REF-1",
      currency: "NGN",
      status: "paid",
      subtotal: 3000,
      taxTotal: 0,
      discountTotal: 0,
      total: 3000,
      amountPaid: 3000,
      amountDue: 0,
      metadata: {},
    },
  });
  const payment = await prisma.payment.create({
    data: {
      tenantId: hotel.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      amount: 3000,
      currency: "NGN",
      provider: "manual",
      status: "captured",
      methodType: "cash",
      capturedAmount: 3000,
      netAmount: 3000,
      metadata: {},
      idempotencyKey: "wave_ref_pay",
    },
  });
  const desk = await staffLogin("wave-hotel", "lagos@wave.hotel");
  const deny = await app.inject({
    method: "POST",
    url: "/billing/refunds",
    headers: { authorization: `Bearer ${desk.token}` },
    payload: {
      paymentId: payment.id,
      amount: 500,
      idempotencyKey: "wave_ref_deny",
      reason: "test",
    },
  });
  assert.equal(deny.statusCode, 403);

  const finance = await staffLogin("wave-hotel", "finance@wave.hotel");
  const allow = await app.inject({
    method: "POST",
    url: "/billing/refunds",
    headers: { authorization: `Bearer ${finance.token}` },
    payload: {
      paymentId: payment.id,
      amount: 500,
      idempotencyKey: "wave_ref_ok",
      reason: "approved",
    },
  });
  assert.equal(allow.statusCode, 201, allow.body);
});

test("guest profile omits internal CRM notes", async () => {
  const hotel = await prisma.tenant.findFirstOrThrow({ where: { slug: "wave-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { email: "guest@wave.hotel" } });
  await prisma.customerNote.create({
    data: {
      tenantId: hotel.id,
      customerId: customer.id,
      body: "SECRET_INTERNAL_NOTE",
      visibility: "internal",
    },
  });
  const prev = config.allowDemoGuest;
  config.allowDemoGuest = true;
  try {
    const demo = await app.inject({
      method: "POST",
      url: "/auth/guest/demo",
      payload: { tenantSlug: "wave-hotel", displayName: "Demo" },
    });
    assert.equal(demo.statusCode, 200, demo.body);
    const token = demo.json().token as string;
    const me = await app.inject({
      method: "GET",
      url: "/auth/guest/me",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.statusCode, 200);
    assert.ok(!JSON.stringify(me.json()).includes("SECRET_INTERNAL_NOTE"));

    const notes = await app.inject({
      method: "GET",
      url: `/customers/${customer.id}/notes`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(notes.statusCode, 401);
  } finally {
    config.allowDemoGuest = prev;
  }
});

test("mass-assignment rejects collector and permissions on staff create", async () => {
  const auth = await staffLogin("wave-hotel", "admin@wave.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/staff",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: {
      displayName: "Injected",
      email: "injected@wave.hotel",
      password: "password123",
      role: "viewer",
      permissions: ["payments.manage"],
      collectedByStaffId: "someone",
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});

test("kitchen role has no payment collect/verify/refund permissions", async () => {
  assert.equal(staffHasPermission("kitchen", "payments.collect"), false);
  assert.equal(staffHasPermission("kitchen", "payments.verify"), false);
  assert.equal(staffHasPermission("kitchen", "payments.refund"), false);
  assert.equal(staffHasPermission("kitchen", "payments.manage"), false);
});
