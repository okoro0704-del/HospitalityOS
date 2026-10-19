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
  collectManualPayment,
  createInvoice,
  createRefund,
  getBranchDailyReconciliation,
  getStaffCollectionsSummary,
  recordCashPayment,
  verifyManualPayment,
} from "../src/services/billing/engine.js";

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
      experienceId: "exp_sunrise_man",
      lifeosBusinessId: "biz_sunrise_man",
      primaryColor: "#0F766E",
      secondaryColor: "#134E4A",
      accentColor: "#F59E0B",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [{ moduleId: "billing", enabled: true, config: {} }],
      },
      staff: {
        create: [
          {
            displayName: "John Collector",
            email: "john@sunrise.hotel",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
          {
            displayName: "Sarah Desk",
            email: "sarah@sunrise.hotel",
            passwordHash: hashPassword("password123"),
            role: "front_desk",
            branchIds: [],
          },
          {
            displayName: "Viewer Only",
            email: "viewer@sunrise.hotel",
            passwordHash: hashPassword("password123"),
            role: "viewer",
            branchIds: [],
          },
        ],
      },
    },
  });

  const branchA = await prisma.branch.create({
    data: {
      tenantId: hotel.id,
      name: "Main Lobby",
      code: "MAIN",
      isPrimary: true,
      timezone: "UTC",
    },
  });
  const branchB = await prisma.branch.create({
    data: {
      tenantId: hotel.id,
      name: "Spa Desk",
      code: "SPA",
      isPrimary: false,
      timezone: "UTC",
    },
  });

  await prisma.staffMember.update({
    where: { tenantId_email: { email: "sarah@sunrise.hotel", tenantId: hotel.id } },
    data: { branchIds: [branchA.id] },
  });

  const other = await prisma.tenant.create({
    data: {
      slug: "peak-fitness",
      name: "Peak Fitness",
      businessType: "gym",
      experienceId: "exp_peak_man",
      lifeosBusinessId: "biz_peak_man",
      primaryColor: "#1D4ED8",
      secondaryColor: "#1E3A8A",
      accentColor: "#22D3EE",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [{ moduleId: "billing", enabled: true, config: {} }],
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
      lifeosUserId: "lifeos_ada_man",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  await prisma.customer.create({
    data: {
      tenantId: other.id,
      displayName: "Other Guest",
      firstName: "Other",
      email: "other@peak.fitness",
      lifeosUserId: "lifeos_other_man",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { hotel, guest, other, branchA, branchB };
}

async function staffLogin(slug: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: slug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string; staff: { id: string } };
}

async function guestLogin() {
  const token = await mockLifeOs.issueToken({
    sub: "lifeos_ada_man",
    aud: "exp_sunrise_man",
    experience_id: "exp_sunrise_man",
    business_id: "biz_sunrise_man",
    display_name: "Ada Guest",
    jti: `jti_man_${Date.now()}`,
  });
  const handoff = `hof_man_${Date.now()}`;
  mockLifeOs.setHandoff(handoff, "exp_sunrise_man", token);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId: "exp_sunrise_man" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  return exchange.json() as { token: string; customer: { id: string } };
}

async function openInvoice(tenantId: string, customerId: string, amount = 50000) {
  return createInvoice({
    tenantId,
    customerId,
    currency: "NGN",
    lines: [{ description: "Service", unitAmount: amount }],
  });
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

test("cash payment confirms and issues receipt", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 120000);
  const payment = await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 120000,
    staffId: john.id,
    idempotencyKey: "cash_man_1",
    notes: "Front desk cash",
    externalReference: "CASH-001",
  });
  assert.equal(payment.status, "captured");
  assert.equal(payment.methodType, "cash");
  assert.equal(payment.provider, "manual");
  assert.equal(payment.collectedByStaffId, john.id);
  assert.equal(payment.externalReference, "CASH-001");

  const receipt = await prisma.receipt.findFirst({ where: { paymentId: payment.id } });
  assert.ok(receipt);
  assert.equal(receipt!.amount, 120000);
  assert.equal(receipt!.methodType, "cash");

  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.status, "paid");
  assert.equal(paid.amountDue, 0);
});

test("pay-to-staff records collector identity", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 80000);
  const { payment, receipt } = await collectManualPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 80000,
    methodType: "pay_to_staff",
    staffId: john.id,
    idempotencyKey: "pts_1",
    notes: "Collected at lobby",
    externalReference: "PTS-9",
  });
  assert.equal(payment.status, "captured");
  assert.equal(payment.methodType, "pay_to_staff");
  assert.equal(payment.collectedByStaffId, john.id);
  assert.ok(receipt);
});

test("cannot claim collection for another staff without manage permission", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const sarah = await prisma.staffMember.findFirstOrThrow({
    where: { email: "sarah@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 10000);
  await assert.rejects(
    () =>
      collectManualPayment({
        tenantId: guest.tenantId,
        invoiceId: invoice.id,
        amount: 10000,
        methodType: "cash",
        staffId: sarah.id,
        collectedByStaffId: john.id,
        idempotencyKey: "claim_other",
        allowCollectForOthers: false,
      }),
    (err: Error & { statusCode?: number }) => err.statusCode === 403,
  );
});

test("manual bank transfer requires verification before receipt", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 45000);
  const collected = await collectManualPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 45000,
    methodType: "bank_transfer_manual",
    staffId: john.id,
    idempotencyKey: "bank_1",
    externalReference: "TRX-7788",
    notes: "GTBank — Ada",
  });
  assert.equal(collected.payment.status, "pending_verification");
  assert.equal(collected.receipt, null);
  assert.equal(collected.payment.capturedAmount, 0);

  const mid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.notEqual(mid.status, "paid");

  const verified = await verifyManualPayment({
    tenantId: guest.tenantId,
    paymentId: collected.payment.id,
    staffId: john.id,
    notes: "Matched statement",
  });
  assert.equal(verified.payment.status, "captured");
  assert.ok(verified.receipt);
  assert.equal(verified.payment.verifiedByStaffId, john.id);

  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.status, "paid");
});

test("manual card records safe metadata only", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 25000);
  const { payment } = await collectManualPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 25000,
    methodType: "card_manual",
    staffId: john.id,
    idempotencyKey: "card_man_1",
    terminalName: "POS-Lobby-2",
    externalReference: "AUTH-4421",
  });
  assert.equal(payment.methodType, "card_manual");
  assert.equal(payment.status, "captured");
  const meta = payment.metadata as Record<string, unknown>;
  assert.equal(meta.terminalName, "POS-Lobby-2");
  const raw = JSON.stringify(payment);
  assert.equal(raw.includes("4111"), false);
  assert.equal(raw.toLowerCase().includes("cvv"), false);
});

test("duplicate payment protection via idempotency", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 30000);
  const a = await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 30000,
    staffId: john.id,
    idempotencyKey: "dup_cash",
  });
  const b = await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 30000,
    staffId: john.id,
    idempotencyKey: "dup_cash",
  });
  assert.equal(a.id, b.id);
  const count = await prisma.payment.count({
    where: { tenantId: guest.tenantId, invoiceId: invoice.id },
  });
  assert.equal(count, 1);
});

test("manual cash refund requires audit of authorizer and processor", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 20000);
  const payment = await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 20000,
    staffId: john.id,
    idempotencyKey: "cash_ref_pay",
  });
  const refund = await createRefund({
    tenantId: guest.tenantId,
    paymentId: payment.id,
    amount: 5000,
    reason: "Guest overpaid",
    idempotencyKey: "cash_ref_1",
    staffId: john.id,
    authorizedByStaffId: john.id,
  });
  assert.equal(refund.status, "completed");
  const meta = refund.metadata as Record<string, unknown>;
  assert.equal(meta.authorizedByStaffId, john.id);
  assert.equal(meta.processedByStaffId, john.id);

  const events = await prisma.paymentAuditEvent.findMany({
    where: { tenantId: guest.tenantId, action: "payment_refunded" },
  });
  assert.ok(events.length >= 1);
});

test("payment audit events for collect and receipt", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 15000);
  await collectManualPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 15000,
    methodType: "other_manual",
    staffId: john.id,
    idempotencyKey: "audit_1",
    correlationId: "corr_audit_1",
  });
  const actions = (
    await prisma.paymentAuditEvent.findMany({ where: { tenantId: guest.tenantId } })
  ).map((e) => e.action);
  assert.ok(actions.includes("payment_created"));
  assert.ok(actions.includes("payment_collected"));
  assert.ok(actions.includes("payment_receipt_issued"));
});

test("staff collections summary groups by collector and method", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const sarah = await prisma.staffMember.findFirstOrThrow({
    where: { email: "sarah@sunrise.hotel" },
  });
  const inv1 = await openInvoice(guest.tenantId, guest.id, 120000);
  const inv2 = await openInvoice(guest.tenantId, guest.id, 80000);
  const inv3 = await openInvoice(guest.tenantId, guest.id, 45000);
  await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: inv1.id,
    amount: 120000,
    staffId: john.id,
    idempotencyKey: "sum_j_cash",
  });
  await collectManualPayment({
    tenantId: guest.tenantId,
    invoiceId: inv2.id,
    amount: 80000,
    methodType: "pay_to_staff",
    staffId: john.id,
    idempotencyKey: "sum_j_pts",
  });
  await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: inv3.id,
    amount: 45000,
    staffId: sarah.id,
    idempotencyKey: "sum_s_cash",
  });

  const summary = await getStaffCollectionsSummary({ tenantId: guest.tenantId });
  assert.equal(summary.paymentCount, 3);
  const johnRow = summary.collectors.find((c) => c.staffId === john.id);
  const sarahRow = summary.collectors.find((c) => c.staffId === sarah.id);
  assert.ok(johnRow);
  assert.ok(sarahRow);
  assert.equal(johnRow!.total, 200000);
  assert.equal(sarahRow!.total, 45000);
});

test("branch daily reconciliation totals", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const branchA = await prisma.branch.findFirstOrThrow({ where: { code: "MAIN" } });
  const inv = await openInvoice(guest.tenantId, guest.id, 100000);
  const payment = await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: inv.id,
    amount: 100000,
    staffId: john.id,
    idempotencyKey: "rec_cash",
    branchId: branchA.id,
  });
  await createRefund({
    tenantId: guest.tenantId,
    paymentId: payment.id,
    amount: 10000,
    reason: "Adjustment",
    idempotencyKey: "rec_ref",
    staffId: john.id,
  });

  const rec = await getBranchDailyReconciliation({
    tenantId: guest.tenantId,
    branchId: branchA.id,
    openingCash: 50000,
    countedTotal: 135000,
  });
  assert.equal(rec.openingCash, 50000);
  assert.equal(rec.cashCollected, 100000);
  assert.equal(rec.refunds, 10000);
  assert.equal(rec.expectedTotal, 140000);
  assert.equal(rec.difference, 5000);
});

test("tenant isolation on manual collect API", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const invoice = await openInvoice(guest.tenantId, guest.id, 10000);
  const other = await staffLogin("peak-fitness", "admin@peak.fitness");
  const res = await app.inject({
    method: "POST",
    url: "/billing/payments/manual/collect",
    headers: { authorization: `Bearer ${other.token}` },
    payload: {
      invoiceId: invoice.id,
      amount: 10000,
      methodType: "cash",
      idempotencyKey: "x_tenant",
    },
  });
  assert.ok(res.statusCode === 404 || res.statusCode === 400, res.body);
});

test("branch isolation blocks staff without branch access", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const branchB = await prisma.branch.findFirstOrThrow({ where: { code: "SPA" } });
  const invoice = await openInvoice(guest.tenantId, guest.id, 10000);
  const sarah = await staffLogin("sunrise-hotel", "sarah@sunrise.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/billing/payments/manual/collect",
    headers: { authorization: `Bearer ${sarah.token}` },
    payload: {
      invoiceId: invoice.id,
      amount: 10000,
      methodType: "cash",
      idempotencyKey: "x_branch",
      branchId: branchB.id,
    },
  });
  assert.equal(res.statusCode, 403, res.body);
});

test("staff permissions: viewer cannot collect; front_desk cannot verify", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 22000);
  const viewer = await staffLogin("sunrise-hotel", "viewer@sunrise.hotel");
  const denyCollect = await app.inject({
    method: "POST",
    url: "/billing/payments/manual/collect",
    headers: { authorization: `Bearer ${viewer.token}` },
    payload: {
      invoiceId: invoice.id,
      amount: 22000,
      methodType: "cash",
      idempotencyKey: "viewer_cash",
    },
  });
  assert.equal(denyCollect.statusCode, 403);

  const pending = await collectManualPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 22000,
    methodType: "bank_transfer_manual",
    staffId: john.id,
    idempotencyKey: "bank_perm",
    externalReference: "REF-1",
  });
  const desk = await staffLogin("sunrise-hotel", "sarah@sunrise.hotel");
  const denyVerify = await app.inject({
    method: "POST",
    url: `/billing/payments/${pending.payment.id}/verify`,
    headers: { authorization: `Bearer ${desk.token}` },
    payload: {},
  });
  assert.equal(denyVerify.statusCode, 403);
});

test("guest pay-at-venue intent then staff collect shows receipt", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 33000);
  const session = await guestLogin();
  const req = await app.inject({
    method: "POST",
    url: "/guest/billing/manual/request",
    headers: { authorization: `Bearer ${session.token}` },
    payload: {
      invoiceId: invoice.id,
      methodType: "pay_at_venue",
      idempotencyKey: "guest_pav_1",
    },
  });
  assert.equal(req.statusCode, 201, req.body);
  const intent = req.json().intent;
  assert.equal(intent.status, "awaiting_collection");

  const admin = await staffLogin("sunrise-hotel", "john@sunrise.hotel");
  const collect = await app.inject({
    method: "POST",
    url: "/billing/payments/manual/collect",
    headers: { authorization: `Bearer ${admin.token}` },
    payload: {
      intentId: intent.id,
      invoiceId: invoice.id,
      amount: 33000,
      methodType: "pay_at_venue",
      idempotencyKey: "staff_pav_1",
    },
  });
  assert.equal(collect.statusCode, 201, collect.body);
  assert.equal(collect.json().payment.collectedByStaffId, john.id);
  assert.ok(collect.json().receipt);

  const billing = await app.inject({
    method: "GET",
    url: "/guest/billing",
    headers: { authorization: `Bearer ${session.token}` },
  });
  assert.equal(billing.statusCode, 200);
  const body = billing.json();
  assert.ok(body.payments.some((p: { status: string }) => p.status === "captured"));
  assert.ok(body.receipts.length >= 1);
});

test("invoice payment consistency after partial manual payment", async () => {
  const guest = await prisma.customer.findFirstOrThrow({ where: { email: "ada@example.com" } });
  const john = await prisma.staffMember.findFirstOrThrow({
    where: { email: "john@sunrise.hotel" },
  });
  const invoice = await openInvoice(guest.tenantId, guest.id, 100000);
  await recordCashPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 40000,
    staffId: john.id,
    idempotencyKey: "partial_1",
  });
  const mid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(mid.status, "partially_paid");
  assert.equal(mid.amountPaid, 40000);
  assert.equal(mid.amountDue, 60000);

  await collectManualPayment({
    tenantId: guest.tenantId,
    invoiceId: invoice.id,
    amount: 60000,
    methodType: "pay_to_staff",
    staffId: john.id,
    idempotencyKey: "partial_2",
  });
  const done = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(done.status, "paid");
  assert.equal(done.amountDue, 0);
});
