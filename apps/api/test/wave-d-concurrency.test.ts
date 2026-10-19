/**
 * Wave D — Concurrency & idempotency (payments, refunds, jobs).
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
import { clearBillingModule } from "./helpers/cleanup-billing.js";
import {
  collectManualPayment,
  createInvoice,
  createRefund,
} from "../src/services/billing/engine.js";
import { enqueueJob } from "../src/services/jobs.js";

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

async function resetDb() {
  await prisma.backgroundJob.deleteMany().catch(() => undefined);
  await clearBillingModule(prisma);
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
    data: { slug: "org-wave-d-conc", name: "Wave D Conc Org", status: "active", metadata: {} },
  });

  const hotel = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "waved-a",
      name: "Wave D A",
      businessType: "hotel",
      experienceId: "exp_wave_d_conc",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: [{ moduleId: "billing", enabled: true, config: {} }],
      },
      staff: {
        create: [
          {
            displayName: "Admin A",
            email: "admin@waved-a.hotel",
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
      email: "ada@waved-a.hotel",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return hotel;
}

async function staffLogin(slug = "waved-a", email = "admin@waved-a.hotel") {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: slug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as { token: string; tenantId: string; staff: { id: string } };
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
  await resetDb();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test("Wave D: two simultaneous cash collects — only one succeeds", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
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
      methodType: "cash",
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

test("Wave D: duplicate refund same idempotency key returns same refund", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();
  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Refund idem", quantity: 1, unitAmount: 50000 }],
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

  const key = `ref_dup_${payment.id}`;
  const a = await createRefund({
    tenantId: hotel.id,
    paymentId: payment.id,
    amount: 20000,
    reason: "partial",
    idempotencyKey: key,
    staffId: staff.staff.id,
  });
  const b = await createRefund({
    tenantId: hotel.id,
    paymentId: payment.id,
    amount: 20000,
    reason: "partial",
    idempotencyKey: key,
    staffId: staff.staff.id,
  });
  assert.equal(a.id, b.id);
  const count = await prisma.refund.count({ where: { paymentId: payment.id } });
  assert.equal(count, 1);
});

test("Wave D: concurrent refunds with different keys cannot exceed captured amount", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: hotel.id } });
  const staff = await staffLogin();
  const invoice = await createInvoice({
    tenantId: hotel.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Refund race", quantity: 1, unitAmount: 50000 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  const { payment } = await collectManualPayment({
    tenantId: hotel.id,
    invoiceId: invoice.id,
    amount: 50000,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `ref_race_pay_${invoice.id}`,
  });

  const results = await Promise.allSettled([
    createRefund({
      tenantId: hotel.id,
      paymentId: payment.id,
      amount: 40000,
      reason: "race a",
      idempotencyKey: `ref_race_a_${payment.id}`,
      staffId: staff.staff.id,
    }),
    createRefund({
      tenantId: hotel.id,
      paymentId: payment.id,
      amount: 40000,
      reason: "race b",
      idempotencyKey: `ref_race_b_${payment.id}`,
      staffId: staff.staff.id,
    }),
  ]);

  const ok = results.filter((r) => r.status === "fulfilled");
  const fail = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(fail.length, 1);

  const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  assert.ok(updated.refundedAmount <= updated.capturedAmount);
  assert.equal(updated.refundedAmount, 40000);

  const refunds = await prisma.refund.findMany({
    where: { paymentId: payment.id, status: "completed" },
  });
  const refundTotal = refunds.reduce((sum, r) => sum + r.amount, 0);
  assert.ok(refundTotal <= updated.capturedAmount);
  assert.equal(refunds.length, 1);
});

test("Wave D: job enqueue idempotency — same key twice returns same job", async () => {
  const hotel = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const key = `job_idem_${hotel.id}`;
  const a = await enqueueJob({
    tenantId: hotel.id,
    type: "cinema.release_expired_holds",
    idempotencyKey: key,
    payload: { n: 1 },
  });
  const b = await enqueueJob({
    tenantId: hotel.id,
    type: "cinema.release_expired_holds",
    idempotencyKey: key,
    payload: { n: 2 },
  });
  assert.equal(a.id, b.id);
  const count = await prisma.backgroundJob.count({
    where: { tenantId: hotel.id, type: "cinema.release_expired_holds", idempotencyKey: key },
  });
  assert.equal(count, 1);
});
