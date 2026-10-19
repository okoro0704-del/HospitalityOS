/**
 * Wave E — Production hardening: money integrity, env gates, branch IDOR, email, jobs.
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
import { validateRuntimeConfig } from "../src/lib/env-validate.js";
import { majorToMinor, assertMinorUnit, sumMinor } from "../src/services/billing/money-units.js";
import {
  createInvoice,
  collectManualPayment,
  createRefund,
  createCreditNote,
} from "../src/services/billing/engine.js";
import { MockEmailProvider, EmailProvider } from "../src/services/communications/providers.js";
import { enqueueJob, processDueJobs, registerJobHandler } from "../src/services/jobs.js";
import { clearBillingModule } from "./helpers/cleanup-billing.js";
import { clearSpaModule } from "./helpers/cleanup-spa.js";
import { clearEventsModule } from "./helpers/cleanup-events.js";
import { clearCinemaModule } from "./helpers/cleanup-cinema.js";

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

const MODULES = ["spa_services", "events", "cinema", "billing"] as const;

let branchAId = "";
let branchBId = "";

async function resetDb() {
  await prisma.backgroundJob.deleteMany().catch(() => undefined);
  await clearCinemaModule(prisma);
  await clearEventsModule(prisma);
  await clearSpaModule(prisma);
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
    data: { slug: "org-wave-e", name: "Wave E Org", status: "active", metadata: {} },
  });

  const tenant = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "wavee-hotel",
      name: "Wave E Hotel",
      businessType: "hotel",
      experienceId: "exp_wave_e",
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
        email: "admin@wavee.hotel",
        displayName: "Admin",
        role: "admin",
        passwordHash: pw,
        branchIds: [],
      },
      {
        tenantId: tenant.id,
        email: "desk-a@wavee.hotel",
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
      email: "guest@wavee.hotel",
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
    payload: { tenantSlug: "wavee-hotel", email, password: "password123" },
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

test("Wave E: majorToMinor converts NGN 1500.50 → 150050", () => {
  assert.equal(majorToMinor(1500.5), 150050);
  assert.equal(assertMinorUnit(150050), 150050);
  assert.throws(() => assertMinorUnit(12.5));
  assert.equal(sumMinor([100, 250, 50]), 400);
});

test("Wave E: production config rejects sqlite, weak secrets, demo guest, mock email", () => {
  const bad = validateRuntimeConfig({
    env: "production",
    databaseUrl: "file:./prod.db",
    sessionSecret: "dev-only-session-secret-change-me",
    webhookSecret: "short",
    allowDemoGuest: true,
    emailProvider: "mock",
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.includes("PostgreSQL")));
  assert.ok(bad.errors.some((e) => e.includes("SESSION_SECRET")));
  assert.ok(bad.errors.some((e) => e.includes("ALLOW_DEMO_GUEST")));
  assert.ok(bad.errors.some((e) => e.includes("EMAIL_PROVIDER")));
  assert.ok(bad.errors.some((e) => e.includes("DIGI_CORE_BASE_URL")));
  assert.ok(bad.errors.some((e) => e.includes("DDI_BASE_URL")));

  const good = validateRuntimeConfig({
    env: "production",
    databaseUrl: "postgresql://hos:hos@localhost:5432/hos",
    sessionSecret: "a".repeat(32) + "-strong-production-secret",
    webhookSecret: "webhook-secret-strong",
    allowDemoGuest: false,
    emailProvider: "smtp",
    smtpUrl: "smtp://user:pass@smtp.example.com:587",
    smtpFrom: "noreply@example.com",
    mediaSigningSecret: "m".repeat(32) + "-media-signing",
    mediaRoot: "/var/lib/hospitalityos/media",
    digiCoreBaseUrl: "https://digi.example.test",
    ddiBaseUrl: "https://ddi.example.test",
    internalProvisionToken: "p".repeat(32) + "-provision",
    primitivesServiceToken: "s".repeat(32) + "-primitives",
    primitivesMode: "remote",
  });
  assert.equal(good.ok, true, good.errors.join("; "));

  const devTokens = validateRuntimeConfig({
    env: "production",
    databaseUrl: "postgresql://hos:hos@localhost:5432/hos",
    sessionSecret: "a".repeat(32) + "-strong-production-secret",
    webhookSecret: "webhook-secret-strong",
    allowDemoGuest: false,
    emailProvider: "smtp",
    smtpUrl: "smtp://user:pass@smtp.example.com:587",
    smtpFrom: "noreply@example.com",
    mediaSigningSecret: "m".repeat(32) + "-media-signing",
    mediaRoot: "/var/lib/hospitalityos/media",
    digiCoreBaseUrl: "https://digi.example.test",
    ddiBaseUrl: "https://ddi.example.test",
    internalProvisionToken: "dev-primitives-token",
    primitivesServiceToken: "dev-primitives-token",
    primitivesMode: "local",
  });
  assert.equal(devTokens.ok, false);
  assert.ok(devTokens.errors.some((e) => e.includes("INTERNAL_PROVISION_TOKEN")));
  assert.ok(devTokens.errors.some((e) => e.includes("PRIMITIVES_SERVICE_TOKEN")));
  assert.ok(devTokens.errors.some((e) => e.includes("PRIMITIVES_MODE")));

  const consoleBanned = validateRuntimeConfig({
    env: "production",
    databaseUrl: "postgresql://hos:hos@localhost:5432/hos",
    sessionSecret: "a".repeat(32) + "-strong-production-secret",
    webhookSecret: "webhook-secret-strong",
    allowDemoGuest: false,
    emailProvider: "console",
    mediaSigningSecret: "m".repeat(32) + "-media-signing",
    mediaRoot: "/var/lib/hospitalityos/media",
    digiCoreBaseUrl: "https://digi.example.test",
    ddiBaseUrl: "https://ddi.example.test",
  });
  assert.equal(consoleBanned.ok, false);
  assert.ok(consoleBanned.errors.some((e) => e.includes("EMAIL_PROVIDER")));
});

test("Wave E: invoice / partial pay / overpay / refund / credit note stay integer minor", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavee-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const staff = await staffLogin("admin@wavee.hotel");

  const invoice = await createInvoice({
    tenantId: tenant.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Stay", quantity: 1, unitAmount: 100050 }],
    actorKind: "staff",
    actorId: staff.staff.id,
  });
  assert.equal(invoice.total, 100050);
  assert.ok(Number.isInteger(invoice.total));

  await collectManualPayment({
    tenantId: tenant.id,
    invoiceId: invoice.id,
    amount: 40000,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `we_partial_${invoice.id}`,
  });
  const mid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(mid.amountPaid, 40000);
  assert.equal(mid.amountDue, 60050);

  await assert.rejects(
    () =>
      collectManualPayment({
        tenantId: tenant.id,
        invoiceId: invoice.id,
        amount: 70000,
        methodType: "cash",
        staffId: staff.staff.id,
        idempotencyKey: `we_over_${invoice.id}`,
      }),
    /exceeds|Amount/i,
  );

  await collectManualPayment({
    tenantId: tenant.id,
    invoiceId: invoice.id,
    amount: 60050,
    methodType: "cash",
    staffId: staff.staff.id,
    idempotencyKey: `we_rest_${invoice.id}`,
  });
  const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(paid.amountDue, 0);

  const payment = await prisma.payment.findFirstOrThrow({
    where: { invoiceId: invoice.id, status: "captured" },
    orderBy: { createdAt: "desc" },
  });
  const refund = await createRefund({
    tenantId: tenant.id,
    paymentId: payment.id,
    amount: 1000,
    reason: "goodwill",
    staffId: staff.staff.id,
    idempotencyKey: `we_refund_${payment.id}`,
  });
  assert.ok(Number.isInteger(refund.amount));

  const cn = await createCreditNote({
    tenantId: tenant.id,
    invoiceId: invoice.id,
    amount: 500,
    reason: "adjustment",
    staffId: staff.staff.id,
  });
  assert.ok(Number.isInteger(cn.amount));
});

test("Wave E: branch-scoped staff cannot list other branch spa appointments (IDOR)", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavee-hotel" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const treatment = await prisma.treatment.create({
    data: {
      tenantId: tenant.id,
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
  const starts = new Date(Date.now() + 86400000);
  await prisma.spaAppointment.create({
    data: {
      tenantId: tenant.id,
      branchId: branchBId,
      customerId: customer.id,
      treatmentId: treatment.id,
      startsAt: starts,
      endsAt: new Date(starts.getTime() + 3600000),
      status: "confirmed",
      addonOfferingIds: [],
    },
  });
  await prisma.spaAppointment.create({
    data: {
      tenantId: tenant.id,
      branchId: branchAId,
      customerId: customer.id,
      treatmentId: treatment.id,
      startsAt: new Date(starts.getTime() + 7200000),
      endsAt: new Date(starts.getTime() + 10800000),
      status: "confirmed",
      addonOfferingIds: [],
    },
  });

  const desk = await staffLogin("desk-a@wavee.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${desk.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const appointments = (list.json() as { appointments: Array<{ branchId: string | null }> }).appointments;
  assert.equal(appointments.length, 1);
  assert.equal(appointments[0].branchId, branchAId);
});

test("Wave E: branch-scoped staff cannot list other branch events", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavee-hotel" } });
  const starts = new Date(Date.now() + 86400000);
  await prisma.event.create({
    data: {
      tenantId: tenant.id,
      branchId: branchBId,
      name: "Gala B",
      code: "GB",
      startsAt: starts,
      endsAt: new Date(starts.getTime() + 7200000),
      capacity: 50,
      imageUrls: [],
      metadata: {},
      status: "published",
    },
  });
  await prisma.event.create({
    data: {
      tenantId: tenant.id,
      branchId: branchAId,
      name: "Gala A",
      code: "GA",
      startsAt: starts,
      endsAt: new Date(starts.getTime() + 7200000),
      capacity: 50,
      imageUrls: [],
      metadata: {},
      status: "published",
    },
  });

  const desk = await staffLogin("desk-a@wavee.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/events",
    headers: { authorization: `Bearer ${desk.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const events = (list.json() as { events: Array<{ branchId: string | null; code: string }> }).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].code, "GA");
});

test("Wave E: branch-scoped staff cannot list other branch cinema venues", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavee-hotel" } });
  await prisma.cinemaVenue.create({
    data: {
      tenantId: tenant.id,
      branchId: branchBId,
      name: "Screen B",
      code: "VB",
      amenities: [],
      imageUrls: [],
      metadata: {},
      status: "active",
    },
  });
  await prisma.cinemaVenue.create({
    data: {
      tenantId: tenant.id,
      branchId: branchAId,
      name: "Screen A",
      code: "VA",
      amenities: [],
      imageUrls: [],
      metadata: {},
      status: "active",
    },
  });

  const desk = await staffLogin("desk-a@wavee.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/cinema/venues",
    headers: { authorization: `Bearer ${desk.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const venues = (list.json() as { venues: Array<{ code: string }> }).venues;
  assert.equal(venues.length, 1);
  assert.equal(venues[0].code, "VA");
});

test("Wave E: mock email provider does not leak body and succeeds", async () => {
  const provider = new MockEmailProvider();
  const result = await provider.send({
    tenantId: "t1",
    to: "guest@example.com",
    subject: "Hello",
    body: "secret-content-should-not-be-logged",
    idempotencyKey: "wave-e-email-1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider, "email_mock");
  assert.ok(result.externalId?.includes("wave-e-email-1"));

  const facade = new EmailProvider();
  const r2 = await facade.send({
    tenantId: "t1",
    to: "guest@example.com",
    body: "x",
  });
  assert.equal(r2.ok, true);
});

test("Wave E: failed jobs enter retrying then dead-letter", async () => {
  let calls = 0;
  registerJobHandler("wave_e.fail", async () => {
    calls++;
    throw new Error("boom");
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "wavee-hotel" } });
  await enqueueJob({
    tenantId: tenant.id,
    type: "wave_e.fail",
    idempotencyKey: `fail_${Date.now()}`,
    maxAttempts: 2,
  });

  const first = await processDueJobs(10);
  assert.ok(first.results.some((r) => r.status === "retrying"));

  await prisma.backgroundJob.updateMany({
    where: { type: "wave_e.fail", tenantId: tenant.id },
    data: { runAt: new Date(Date.now() - 1000) },
  });
  const second = await processDueJobs(10);
  assert.ok(second.results.some((r) => r.status === "dead"));
  assert.ok(calls >= 2);
});
