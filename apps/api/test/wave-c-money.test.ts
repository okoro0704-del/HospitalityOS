/**
 * Wave C — Money & lifecycle completion.
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
import { config } from "../src/config.js";
import { hashPassword } from "../src/lib/crypto.js";
import { startMockLifeOs, type MockLifeOs } from "./helpers/mock-lifeos.js";
import { clearBillingModule } from "./helpers/cleanup-billing.js";
import { clearBookingEngine } from "./helpers/cleanup-booking.js";
import { clearFitnessModule } from "./helpers/cleanup-fitness.js";
import { clearDiningModule } from "./helpers/cleanup-dining.js";
import { clearSpaModule } from "./helpers/cleanup-spa.js";
import { clearEventsModule } from "./helpers/cleanup-events.js";
import { clearCinemaModule } from "./helpers/cleanup-cinema.js";
import {
  collectManualPayment,
  createInvoice,
  createRefund,
  closeDailyReconciliation,
  recordCashPayment,
} from "../src/services/billing/engine.js";
import { assertPaymentTransition } from "../src/services/billing/lifecycle.js";
import { createReservation } from "../src/services/accommodation.js";
import { createOrder, transitionOrder } from "../src/services/restaurant.js";
import { createMembership } from "../src/services/fitness.js";
import { bookSpaAppointment } from "../src/services/spa.js";

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
];

async function resetDb() {
  await prisma.reservationTimeline.deleteMany().catch(() => undefined);
  await prisma.reservationGuest.deleteMany().catch(() => undefined);
  await prisma.stay.deleteMany().catch(() => undefined);
  await prisma.accommodationReservation.deleteMany().catch(() => undefined);
  await clearCinemaModule(prisma);
  await clearEventsModule(prisma);
  await clearSpaModule(prisma);
  await clearFitnessModule(prisma);
  await clearDiningModule(prisma);
  await clearBillingModule(prisma);
  await clearBookingEngine(prisma);
  await prisma.roomAvailability.deleteMany().catch(() => undefined);
  await prisma.room.deleteMany().catch(() => undefined);
  await prisma.roomType.deleteMany().catch(() => undefined);
  await prisma.property.deleteMany().catch(() => undefined);
  await prisma.customerEvent.deleteMany().catch(() => undefined);
  await prisma.notification.deleteMany().catch(() => undefined);
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
    data: { slug: "org-wave-c", name: "Wave C Org", status: "active", metadata: {} },
  });

  const hotel = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "wavec-hotel",
      name: "Wave C Hotel",
      businessType: "hotel",
      experienceId: "exp_wave_c",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [
          { moduleId: "accommodation", enabled: true, config: {} },
          { moduleId: "restaurant", enabled: true, config: {} },
          { moduleId: "gym_membership", enabled: true, config: {} },
          { moduleId: "spa_services", enabled: true, config: {} },
          { moduleId: "events", enabled: true, config: {} },
          { moduleId: "cinema", enabled: true, config: {} },
          { moduleId: "billing", enabled: true, config: {} },
          { moduleId: "commerce", enabled: true, config: {} },
        ],
      },
      staff: {
        create: [
          {
            displayName: "Wave Admin",
            email: "admin@wavec.hotel",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });

  await prisma.branch.create({
    data: { tenantId: hotel.id, name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC" },
  });

  await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Ada Guest",
      email: "ada@guest.test",
      lifeosUserId: "lifeos_ada_wave_c",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const other = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "wavec-other",
      name: "Other Tenant",
      businessType: "hotel",
      experienceId: "exp_wave_c_other",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: { create: [{ moduleId: "billing", enabled: true, config: {} }] },
      staff: {
        create: [
          {
            displayName: "Other Admin",
            email: "admin@other.hotel",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });
  await prisma.customer.create({
    data: {
      tenantId: other.id,
      displayName: "Other Guest",
      email: "other@guest.test",
      lifeosUserId: "lifeos_other_wave_c",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return hotel;
}

async function staffLogin(slug = "wavec-hotel", email = "admin@wavec.hotel") {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: slug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { token: string; tenantId: string; staff: { id: string } };
  return body;
}

async function guestLogin(lifeosUserId = "lifeos_ada_wave_c", experienceId = "exp_wave_c") {
  const token = await mockLifeOs.issueToken({
    sub: lifeosUserId,
    aud: experienceId,
    experience_id: experienceId,
    business_id: "biz_wave_c",
    display_name: "Ada Guest",
    jti: `jti_wc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });
  const handoff = `hof_wc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  mockLifeOs.setHandoff(handoff, experienceId, token);
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff, experienceId },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; customer: { id: string }; tenantId: string };
}

before(async () => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  mockLifeOs = await startMockLifeOs();
  config.lifeosApiUrl = mockLifeOs.baseUrl;
  config.lifeosJwksUrl = mockLifeOs.jwksUrl;
  app = await buildApp();
});

after(async () => {
  await app.close();
  await mockLifeOs.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

test("Wave C: payment transition assert rejects invalid jumps", () => {
  assert.throws(() => assertPaymentTransition("captured", "pending"), /Invalid payment transition/);
  assert.doesNotThrow(() => assertPaymentTransition("pending_verification", "captured"));
  assert.doesNotThrow(() => assertPaymentTransition("captured", "refunded"));
});

test("Wave C: hotel reservation → invoice → cash → receipt → activity", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const property = await prisma.property.create({
    data: {
      tenantId: hotel.id,
      name: "Tower",
      code: "T1",
      propertyType: "hotel",
      status: "active",
      timezone: "UTC",
    },
  });
  const roomType = await prisma.roomType.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      name: "Deluxe",
      code: "DLX",
      status: "active",
      baseRate: 100000,
      capacity: 2,
      photoUrls: [],
    },
  });
  await prisma.room.create({
    data: {
      tenantId: hotel.id,
      propertyId: property.id,
      roomTypeId: roomType.id,
      number: "101",
      status: "active",
      occupancyStatus: "vacant",
      housekeepingStatus: "clean",
    },
  });

  const checkIn = new Date("2030-01-10T12:00:00Z");
  const checkOut = new Date("2030-01-12T12:00:00Z");
  const reservation = await createReservation({
    tenantId: hotel.id,
    propertyId: property.id,
    roomTypeId: roomType.id,
    customerId: customer.id,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const billable = await prisma.billableItem.findFirst({
    where: {
      tenantId: hotel.id,
      sourceModule: "accommodation",
      sourceEntityId: reservation.id,
    },
  });
  assert.ok(billable?.invoiceId);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: billable!.invoiceId! } });
  assert.equal(invoice.total, 200000); // 100000 minor/night × 2 nights
  assert.equal(invoice.amountDue, 200000);

  const pay = await recordCashPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: invoice.amountDue,
    staffId: staff.staff.id,
    idempotencyKey: `wave_c_hotel_${invoice.id}`,
  });
  assert.equal(pay.status, "captured");
  const receipt = await prisma.receipt.findFirst({ where: { paymentId: pay.id } });
  assert.ok(receipt);

  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.status, "paid");
  assert.equal(paid.amountDue, 0);

  const guest = await guestLogin();
  const activity = await app.inject({
    method: "GET",
    url: "/guest/activity",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  assert.equal(activity.statusCode, 200, activity.body);
  const items = (activity.json() as { items: Array<{ category: string }> }).items;
  assert.ok(items.some((i) => i.category === "reservation"));
  assert.ok(items.some((i) => i.category === "invoice"));
  assert.ok(items.some((i) => i.category === "receipt"));
});

test("Wave C: partial payment leaves remaining balance", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Deposit", quantity: 1, unitAmount: 100000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: 40000,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `partial_1_${invoice.id}`,
  });

  const mid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(mid.status, "partially_paid");
  assert.equal(mid.amountPaid, 40000);
  assert.equal(mid.amountDue, 60000);

  await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: 60000,
    methodType: "pay_to_staff",
    staffId: staff.staff.id,
    idempotencyKey: `partial_2_${invoice.id}`,
  });

  const done = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(done.status, "paid");
  assert.equal(done.amountDue, 0);
});

test("Wave C: refund updates payment + guest activity; original payment preserved", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Service", quantity: 1, unitAmount: 50000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  const { payment } = await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: 50000,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `ref_pay_${invoice.id}`,
  });

  const refund = await createRefund({
    tenantId: hotel.id,
    paymentId: payment.id,
    amount: 20000,
    reason: "partial cancel",
    idempotencyKey: `ref_${payment.id}`,
    staffId: staff.staff.id,
  });
  assert.equal(refund.status, "completed");

  const updatedPay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  assert.equal(updatedPay.status, "partially_refunded");
  assert.ok(await prisma.payment.findUnique({ where: { id: payment.id } }));

  const guest = await guestLogin();
  const activity = await app.inject({
    method: "GET",
    url: "/guest/activity",
    headers: { authorization: `Bearer ${guest.token}` },
  });
  const items = (activity.json() as { items: Array<{ category: string }> }).items;
  assert.ok(items.some((i) => i.category === "refund"));
});

test("Wave C: duplicate payment idempotency key does not double-charge", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();
  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Idem", quantity: 1, unitAmount: 25000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  const key = `idem_${invoice.id}`;
  const a = await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: 25000,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: key,
  });
  const b = await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: 25000,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: key,
  });
  assert.equal(a.payment.id, b.payment.id);
  const count = await prisma.payment.count({ where: { invoiceId: invoice.id } });
  assert.equal(count, 1);
});

test("Wave C: concurrent collects cannot overpay invoice", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();
  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Race", quantity: 1, unitAmount: 30000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const results = await Promise.allSettled([
    collectManualPayment({
      tenantId: hotel.id,
      invoiceId: invoice.id,
      amount: 30000,
      methodType: "cash",
      staffId: staff.staff.id,
      idempotencyKey: `race_a_${invoice.id}`,
    }),
    collectManualPayment({
      tenantId: hotel.id,
      invoiceId: invoice.id,
      amount: 30000,
      methodType: "pay_to_staff",
      staffId: staff.staff.id,
      idempotencyKey: `race_b_${invoice.id}`,
    }),
  ]);

  const ok = results.filter((r) => r.status === "fulfilled");
  const fail = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(fail.length, 1);

  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.amountPaid, 30000);
  assert.equal(paid.status, "paid");
});

test("Wave C: dining order completion creates invoice and bill status syncs on pay", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const order = await createOrder({
    tenantId: hotel.id,
    customerId: customer.id,
    orderType: "dine_in",
    items: [{ name: "Jollof", quantity: 1, unitPrice: 5000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  await transitionOrder({
    tenantId: hotel.id,
    orderId: order.id,
    status: "completed",
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const billable = await prisma.billableItem.findFirst({
    where: { tenantId: hotel.id, sourceModule: "restaurant", sourceEntityId: order.id },
  });
  assert.ok(billable?.invoiceId);

  await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: billable!.invoiceId!,
    amount: billable!.total,
    methodType: "pay_to_staff",
    staffId: staff.staff.id,
    idempotencyKey: `dining_${order.id}`,
  });

  const updated = await prisma.diningOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(updated.billStatus, "paid");
});

test("Wave C: pending membership activates only after full payment", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const plan = await prisma.membershipPlan.create({
    data: {
      tenantId: hotel.id,
      name: "Monthly",
      code: "M1",
      durationDays: 30,
      price: 20000,
      status: "active",
      accessRules: {},
      includedClasses: [],
    },
  });

  const membership = await createMembership({
    tenantId: hotel.id,
    planId: plan.id,
    customerId: customer.id,
    activate: false,
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  assert.equal(membership.status, "pending");

  const billable = await prisma.billableItem.findFirst({
    where: {
      tenantId: hotel.id,
      sourceModule: "gym_membership",
      sourceEntityId: membership.id,
    },
  });
  assert.ok(billable?.invoiceId);

  await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: billable!.invoiceId!,
    amount: billable!.total,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `mem_${membership.id}`,
  });

  const active = await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } });
  assert.equal(active.status, "active");
});

test("Wave C: spa appointment creates invoice", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();

  const treatment = await prisma.treatment.create({
    data: {
      tenantId: hotel.id,
      name: "Massage",
      code: "MSG",
      durationMinutes: 60,
      price: 15000,
      status: "active",
      requiredSpecialties: [],
      requiredRoomTypes: [],
      imageUrls: [],
      metadata: {},
    },
  });

  const startsAt = new Date(Date.now() + 86400000);
  const { appointment } = await bookSpaAppointment({
    tenantId: hotel.id,
    customerId: customer.id,
    treatmentId: treatment.id,
    startsAt,
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const billable = await prisma.billableItem.findFirst({
    where: {
      tenantId: hotel.id,
      sourceModule: "spa_services",
      sourceEntityId: appointment.id,
    },
  });
  assert.ok(billable?.invoiceId);
  assert.equal(billable!.total, 15000);
});

test("Wave C: guest cannot read another guest activity or receipt", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();
  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Own", quantity: 1, unitAmount: 1000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  const { receipt } = await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: 1000,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `own_rec_${invoice.id}`,
  });
  assert.ok(receipt);

  const otherGuest = await prisma.customer.create({
    data: {
      tenantId: hotel.id,
      displayName: "Bob",
      email: "bob@guest.test",
      lifeosUserId: "lifeos_bob_wave_c",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });
  const bobToken = await mockLifeOs.issueToken({
    sub: otherGuest.lifeosUserId!,
    aud: "exp_wave_c",
    experience_id: "exp_wave_c",
    business_id: "biz_wave_c",
    display_name: "Bob",
    jti: `jti_bob_${Date.now()}`,
  });
  const bobHandoff = `hof_bob_${Date.now()}`;
  mockLifeOs.setHandoff(bobHandoff, "exp_wave_c", bobToken);
  const exchange = await app.inject({
    method: "POST",
    url: "/auth/guest/exchange",
    payload: { handoff: bobHandoff, experienceId: "exp_wave_c" },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  const bob = exchange.json() as { token: string };

  const denied = await app.inject({
    method: "GET",
    url: `/guest/billing/receipts/${receipt!.id}`,
    headers: { authorization: `Bearer ${bob.token}` },
  });
  assert.equal(denied.statusCode, 404);

  const activity = await app.inject({
    method: "GET",
    url: "/guest/activity",
    headers: { authorization: `Bearer ${bob.token}` },
  });
  const items = (activity.json() as { items: Array<{ category: string; id: string }> }).items;
  assert.ok(!items.some((i) => i.id === receipt!.id));
});

test("Wave C: tenant isolation on invoices", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();
  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Iso", quantity: 1, unitAmount: 5000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });

  const other = await staffLogin("wavec-other", "admin@other.hotel");
  const peek = await app.inject({
    method: "GET",
    url: `/billing/invoices/${invoice.id}`,
    headers: { authorization: `Bearer ${other.token}` },
  });
  assert.equal(peek.statusCode, 404);
});

test("Wave C: reconciliation close is idempotent", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavec-hotel" } });
  const staff = await staffLogin();
  const a = await closeDailyReconciliation({
    tenantId: hotel.id,
    countedTotal: 0,
    openingCash: 0,
    staffId: staff.staff.id,
  });
  assert.equal(a.alreadyClosed, false);
  const b = await closeDailyReconciliation({
    tenantId: hotel.id,
    countedTotal: 0,
    openingCash: 0,
    staffId: staff.staff.id,
  });
  assert.equal(b.alreadyClosed, true);
  assert.equal(a.settlement.id, b.settlement.id);
});

test("Wave C: overview exposes financial metrics", async () => {
  const staff = await staffLogin();
  const res = await app.inject({
    method: "GET",
    url: "/operations/overview",
    headers: { authorization: `Bearer ${staff.token}` },
  });
  assert.equal(res.statusCode, 200);
  const metrics = (res.json() as { overview: { metrics: Array<{ id: string }> } }).overview.metrics;
  const ids = metrics.map((m) => m.id);
  assert.ok(ids.includes("revenue_today"));
  assert.ok(ids.includes("outstanding"));
  assert.ok(ids.includes("manual_collections_today"));
  assert.ok(ids.includes("refunds_today"));
  assert.ok(ids.includes("pending_verification"));
});
