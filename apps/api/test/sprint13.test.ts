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
import { majorToMinor, money, taxOnExclusive } from "../src/services/billing/money.js";
import {
  authorizeAndCapture,
  cancelPaymentIntent,
  createCreditNote,
  createInvoice,
  createPaymentIntent,
  createRefund,
  processWebhook,
  recordCashPayment,
} from "../src/services/billing/engine.js";
import {
  billAccommodation,
  billCinema,
  billCommerce,
  billDining,
  billEvents,
  billFitness,
  billSpa,
} from "../src/services/billing/verticals.js";

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
      experienceId: "exp_sunrise_pay",
      lifeosBusinessId: "biz_sunrise_pay",
      primaryColor: "#0F766E",
      secondaryColor: "#134E4A",
      accentColor: "#F59E0B",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "billing", enabled: true, config: {} },
          { moduleId: "notifications", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Billing Admin",
            email: "billing@sunrise.hotel",
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
      experienceId: "exp_peak_pay",
      lifeosBusinessId: "biz_peak_pay",
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
      email: "ada@example.com",
      lifeosUserId: "lifeos_ada_pay",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  await prisma.billingTaxRule.create({
    data: {
      tenantId: hotel.id,
      code: "VAT",
      name: "VAT",
      category: "vat",
      jurisdiction: "NG",
      rateBps: 750,
      inclusive: false,
      status: "active",
      metadata: {},
    },
  });

  return { hotel, guest };
}

async function staffLogin(slug: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: slug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string };
}

async function guestLogin() {
  const token = await mockLifeOs.issueToken({
    sub: "lifeos_ada_pay",
    aud: "exp_sunrise_pay",
    experience_id: "exp_sunrise_pay",
    business_id: "biz_sunrise_pay",
    display_name: "Ada Guest",
    jti: `jti_pay_${Date.now()}`,
  });
  const handoff = `hof_pay_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_sunrise_pay", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_sunrise_pay" },
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

test("money precision uses integer minor units", () => {
  assert.equal(majorToMinor(10500, "NGN"), 1050000);
  assert.equal(money(1050000, "NGN").amount, 1050000);
  assert.equal(taxOnExclusive(10000, 750), 750);
  assert.throws(() => money(10.5, "NGN"));
});

test("invoice creation calculates tax and lines", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    taxRuleCode: "VAT",
    lines: [{ description: "Room night", unitAmount: 100000, quantity: 1 }],
  });
  assert.equal(invoice.subtotal, 100000);
  assert.equal(invoice.taxTotal, 7500);
  assert.equal(invoice.total, 107500);
  assert.equal(invoice.amountDue, 107500);
  assert.equal(invoice.lines.length, 1);
});

test("payment intent authorize capture refund and partial refund", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "Stay", unitAmount: 50000 }],
  });
  const intent = await createPaymentIntent({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    idempotencyKey: "pi_1",
  });
  const { payment, receipt } = await authorizeAndCapture({
    tenantId: guest.tenantId,
    intentId: intent.id,
    idempotencyKey: "pay_1",
  });
  assert.equal(payment.status, "captured");
  assert.ok(receipt);
  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.status, "paid");

  const partial = await createRefund({
    tenantId: guest.tenantId,
    paymentId: payment.id,
    amount: 10000,
    idempotencyKey: "ref_partial",
  });
  assert.equal(partial.status, "completed");
  const afterPartial = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  assert.equal(afterPartial.status, "partially_refunded");

  const full = await createRefund({
    tenantId: guest.tenantId,
    paymentId: payment.id,
    amount: 40000,
    idempotencyKey: "ref_full",
  });
  assert.equal(full.status, "completed");
});

test("idempotent payment intent and concurrent capture", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "USD",
    lines: [{ description: "Package", unitAmount: 20000 }],
  });
  const a = await createPaymentIntent({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    idempotencyKey: "same_key",
  });
  const b = await createPaymentIntent({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    idempotencyKey: "same_key",
  });
  assert.equal(a.id, b.id);

  await createPaymentIntent({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    idempotencyKey: "cap_race",
  }).then(async (intent) => {
    const results = await Promise.all([
      authorizeAndCapture({
        tenantId: guest.tenantId,
        intentId: intent.id,
        idempotencyKey: "same_pay",
      }),
      authorizeAndCapture({
        tenantId: guest.tenantId,
        intentId: intent.id,
        idempotencyKey: "same_pay",
      }),
    ]);
    assert.equal(results[0]!.payment.id, results[1]!.payment.id);
  });
});

test("cannot refund more than captured; cancel blocks capture", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "X", unitAmount: 10000 }],
  });
  const intent = await createPaymentIntent({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    idempotencyKey: "cancel_me",
  });
  await cancelPaymentIntent({ tenantId: guest.tenantId, intentId: intent.id });
  await assert.rejects(
    () => authorizeAndCapture({ tenantId: guest.tenantId, intentId: intent.id }),
    (e: Error & { code?: string }) => e.code === "invalid_state",
  );

  const invoice2 = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "Y", unitAmount: 10000 }],
  });
  const intent2 = await createPaymentIntent({
    tenantId: guest.tenantId,
    invoiceId: invoice2.id,
    idempotencyKey: "ok_pay",
  });
  const { payment } = await authorizeAndCapture({
    tenantId: guest.tenantId,
    intentId: intent2.id,
    idempotencyKey: "ok_cap",
  });
  await assert.rejects(
    () =>
      createRefund({
        tenantId: guest.tenantId,
        paymentId: payment.id,
        amount: 999999,
        idempotencyKey: "bad_ref",
      }),
    (e: Error & { code?: string }) => e.code === "validation_error",
  );
});

test("cash payment and credit note", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const staff = await prisma.staffMember.findFirstOrThrow({
    where: { email: "billing@sunrise.hotel" },
  });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "Cash sale", unitAmount: 25000 }],
  });
  const payment = await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 25000,
    staffId: staff.id,
    idempotencyKey: "cash_1",
  });
  assert.equal(payment.methodType, "cash");
  const note = await createCreditNote({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 5000,
    reason: "Adjustment",
    staffId: staff.id,
  });
  assert.ok(note.number.startsWith("CN-"));
});

test("webhook idempotency", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const payload = { eventId: "wh_1", eventType: "payment.captured", tenantId: guest.tenantId };
  const a = await processWebhook({ provider: "mock", payload, tenantId: guest.tenantId });
  const b = await processWebhook({ provider: "mock", payload, tenantId: guest.tenantId });
  assert.equal(a.id, b.id);
  assert.equal(b.status, "processed");
});

test("provider failure scenario", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "Fail", unitAmount: 1000 }],
  });
  const intent = await createPaymentIntent({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    idempotencyKey: "fail_auth",
    scenario: "fail_auth",
  });
  await assert.rejects(
    () =>
      authorizeAndCapture({
        tenantId: guest.tenantId,
        intentId: intent.id,
        idempotencyKey: "fail_cap",
      }),
    (e: Error & { code?: string }) => e.code === "payment_failed",
  );
});

test("vertical billable integrations", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const base = {
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    unitAmount: 10000,
  };
  await billAccommodation({ ...base, sourceEntityId: "res_1", description: "Stay" });
  await billDining({ ...base, sourceEntityId: "ord_1", description: "Dinner" });
  await billFitness({ ...base, sourceEntityId: "mem_1", description: "Membership" });
  await billSpa({ ...base, sourceEntityId: "spa_1", description: "Massage" });
  await billEvents({ ...base, sourceEntityId: "tkt_1", description: "Ticket" });
  await billCinema({ ...base, sourceEntityId: "cin_1", description: "Show" });
  await billCommerce({ ...base, sourceEntityId: "com_1", description: "Product" });
  const items = await prisma.billableItem.count({ where: { tenantId: guest.tenantId } });
  assert.equal(items, 7);
});

test("tenant isolation and role permissions", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "Iso", unitAmount: 1000 }],
  });
  const other = await staffLogin("peak-fitness", "admin@peak.fitness");
  const denied = await app.inject({
    method: "GET",
    url: `/billing/invoices/${invoice.id}`,
    headers: { authorization: `Bearer ${other.token}` },
  });
  assert.equal(denied.statusCode, 404);

  const viewer = await staffLogin("sunrise-hotel", "viewer@sunrise.hotel");
  const createDenied = await app.inject({
    method: "POST",
    url: "/billing/invoices",
    headers: { authorization: `Bearer ${viewer.token}` },
    payload: {
      customerId: guest.id,
      currency: "NGN",
      lines: [{ description: "Nope", unitAmount: 100 }],
    },
  });
  assert.equal(createDenied.statusCode, 403);
});

test("guest billing privacy and mock payment", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "Guest pay", unitAmount: 15000 }],
  });
  const g = await guestLogin();
  const list = await app.inject({
    method: "GET",
    url: "/guest/billing/invoices",
    headers: { authorization: `Bearer ${g.token}` },
  });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().invoices.some((i: { id: string }) => i.id === invoice.id));

  const intent = await app.inject({
    method: "POST",
    url: "/guest/billing/payment-intents",
    headers: { authorization: `Bearer ${g.token}` },
    payload: { invoiceId: invoice.id, idempotencyKey: "guest_pi" },
  });
  assert.equal(intent.statusCode, 201, intent.body);
  const cap = await app.inject({
    method: "POST",
    url: `/guest/billing/payment-intents/${intent.json().intent.id}/capture`,
    headers: { authorization: `Bearer ${g.token}` },
    payload: { idempotencyKey: "guest_cap" },
  });
  assert.equal(cap.statusCode, 200, cap.body);
  assert.equal(cap.json().payment.status, "captured");
});

test("audit logging for invoice creation", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  await createInvoice({
    tenantId: guest.tenantId,
    customerId: guest.id,
    currency: "NGN",
    lines: [{ description: "Audit", unitAmount: 100 }],
    actorKind: "staff",
    actorId: "staff_x",
  });
  const audits = await prisma.paymentAuditEvent.findMany({
    where: { tenantId: guest.tenantId, action: "billing.invoice.created" },
  });
  assert.ok(audits.length >= 1);
});
