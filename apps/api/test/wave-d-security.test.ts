/**
 * Wave D — Security, tenant isolation, IDOR, jobs, branch scope.
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
import { clearSpaModule } from "./helpers/cleanup-spa.js";
import { clearEventsModule } from "./helpers/cleanup-events.js";
import { clearCinemaModule } from "./helpers/cleanup-cinema.js";
import { enqueueJob, processDueJobs } from "../src/services/jobs.js";
import { createInvoice } from "../src/services/billing/engine.js";

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

const MODULES = [
  "spa_services",
  "events",
  "cinema",
  "billing",
  "accommodation",
  "restaurant",
  "gym_membership",
] as const;

async function resetDb() {
  await prisma.backgroundJob.deleteMany().catch(() => undefined);
  await clearCinemaModule(prisma);
  await clearEventsModule(prisma);
  await clearSpaModule(prisma);
  await clearBillingModule(prisma);
  await prisma.mediaAsset.deleteMany().catch(() => undefined);
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
    data: { slug: "org-wave-d", name: "Wave D Org", status: "active", metadata: {} },
  });

  const tenantA = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "waved-a",
      name: "Wave D A",
      businessType: "hotel",
      experienceId: "exp_wave_d_a",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: MODULES.map((moduleId) => ({ moduleId, enabled: true, config: {} })),
      },
    },
  });

  const lagos = await prisma.branch.create({
    data: {
      tenantId: tenantA.id,
      name: "Lagos",
      code: "LOS",
      isPrimary: true,
      timezone: "UTC",
    },
  });
  const abuja = await prisma.branch.create({
    data: {
      tenantId: tenantA.id,
      name: "Abuja",
      code: "ABJ",
      isPrimary: false,
      timezone: "UTC",
    },
  });

  await prisma.staffMember.createMany({
    data: [
      {
        tenantId: tenantA.id,
        displayName: "Admin A",
        email: "admin@waved-a.hotel",
        passwordHash: hashPassword("password123"),
        role: "admin",
        branchIds: [],
      },
      {
        tenantId: tenantA.id,
        displayName: "Lagos Desk",
        email: "lagos@waved-a.hotel",
        passwordHash: hashPassword("password123"),
        role: "front_desk",
        branchIds: [lagos.id],
      },
    ],
  });

  await prisma.customer.create({
    data: {
      tenantId: tenantA.id,
      displayName: "Guest A",
      email: "guest@waved-a.hotel",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  const tenantB = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      slug: "waved-b",
      name: "Wave D B",
      businessType: "hotel",
      experienceId: "exp_wave_d_b",
      operatingHours: hours,
      settings: {},
      status: "active",
      modules: {
        create: MODULES.map((moduleId) => ({ moduleId, enabled: true, config: {} })),
      },
      staff: {
        create: [
          {
            displayName: "Admin B",
            email: "admin@waved-b.hotel",
            passwordHash: hashPassword("password123"),
            role: "admin",
            branchIds: [],
          },
        ],
      },
    },
  });
  await prisma.branch.create({
    data: { tenantId: tenantB.id, name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC" },
  });
  await prisma.customer.create({
    data: {
      tenantId: tenantB.id,
      displayName: "Guest B",
      email: "guest@waved-b.hotel",
      preferences: {},
      loyaltyPlaceholder: {},
      metadata: {},
    },
  });

  return { tenantA, tenantB, lagos, abuja };
}

async function staffLogin(slug = "waved-a", email = "admin@waved-a.hotel") {
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
  await resetDb();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test("Wave D: GET /ready returns ready + database ok", async () => {
  const res = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { status: string; checks: { database: string } };
  assert.equal(body.status, "ready");
  assert.equal(body.checks.database, "ok");
});

test("Wave D: GET /health returns ok", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "ok");
});

test("Wave D: cross-tenant spa appointment IDOR — tenant B list excludes A", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customerA = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } });

  const treatment = await prisma.treatment.create({
    data: {
      tenantId: tenantA.id,
      name: "Massage",
      code: "MSG-A",
      durationMinutes: 60,
      price: 10000,
      requiredSpecialties: [],
      requiredRoomTypes: [],
      imageUrls: [],
      metadata: {},
      status: "active",
    },
  });
  const startsAt = new Date(Date.now() + 86400000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const appointment = await prisma.spaAppointment.create({
    data: {
      tenantId: tenantA.id,
      customerId: customerA.id,
      treatmentId: treatment.id,
      startsAt,
      endsAt,
      status: "confirmed",
      addonOfferingIds: [],
      notes: null,
    },
  });

  const staffB = await staffLogin("waved-b", "admin@waved-b.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${staffB.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const ids = (list.json() as { appointments: Array<{ id: string }> }).appointments.map((a) => a.id);
  assert.ok(!ids.includes(appointment.id));
});

test("Wave D: cross-tenant event ticket IDOR — tenant B list excludes A", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customerA = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } });
  const startsAt = new Date(Date.now() + 86400000);
  const endsAt = new Date(startsAt.getTime() + 3 * 3600000);

  const event = await prisma.event.create({
    data: {
      tenantId: tenantA.id,
      name: "Gala",
      code: "EV-A1",
      startsAt,
      endsAt,
      capacity: 50,
      imageUrls: [],
      metadata: {},
      status: "published",
    },
  });
  const ticketType = await prisma.eventTicketType.create({
    data: {
      tenantId: tenantA.id,
      eventId: event.id,
      name: "GA",
      code: "GA-A",
      price: 5000,
      capacity: 50,
      accessRules: {},
      status: "active",
    },
  });
  const ticket = await prisma.eventTicket.create({
    data: {
      tenantId: tenantA.id,
      eventId: event.id,
      ticketTypeId: ticketType.id,
      customerId: customerA.id,
      status: "confirmed",
      metadata: {},
    },
  });

  const staffB = await staffLogin("waved-b", "admin@waved-b.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/tickets",
    headers: { authorization: `Bearer ${staffB.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const ids = (list.json() as { tickets: Array<{ id: string }> }).tickets.map((t) => t.id);
  assert.ok(!ids.includes(ticket.id));
});

test("Wave D: cross-tenant cinema ticket IDOR — tenant B list excludes A", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customerA = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } });
  const startsAt = new Date(Date.now() + 86400000);
  const endsAt = new Date(startsAt.getTime() + 2 * 3600000);

  const venue = await prisma.cinemaVenue.create({
    data: {
      tenantId: tenantA.id,
      name: "Main Cinema",
      code: "CIN-A",
      amenities: [],
      imageUrls: [],
      metadata: {},
      status: "active",
    },
  });
  const screen = await prisma.cinemaScreen.create({
    data: {
      tenantId: tenantA.id,
      venueId: venue.id,
      name: "Screen 1",
      code: "SCR-A",
      capacity: 40,
      amenities: [],
      metadata: {},
      status: "active",
      seatingMode: "general_admission",
    },
  });
  const content = await prisma.cinemaContent.create({
    data: {
      tenantId: tenantA.id,
      title: "Wave Film",
      code: "FILM-A",
      runtimeMinutes: 100,
      metadata: {},
      status: "active",
    },
  });
  const showtime = await prisma.cinemaShowtime.create({
    data: {
      tenantId: tenantA.id,
      contentId: content.id,
      screenId: screen.id,
      startsAt,
      endsAt,
      capacity: 40,
      seatingMode: "general_admission",
      status: "open",
      metadata: {},
    },
  });
  const ticketType = await prisma.cinemaTicketType.create({
    data: {
      tenantId: tenantA.id,
      showtimeId: showtime.id,
      name: "Adult",
      code: "ADT-A",
      price: 2500,
      capacity: 40,
      accessRules: {},
      status: "active",
    },
  });
  const ticket = await prisma.cinemaTicket.create({
    data: {
      tenantId: tenantA.id,
      showtimeId: showtime.id,
      ticketTypeId: ticketType.id,
      customerId: customerA.id,
      status: "confirmed",
      metadata: {},
    },
  });

  const staffB = await staffLogin("waved-b", "admin@waved-b.hotel");
  const list = await app.inject({
    method: "GET",
    url: "/cinema/tickets",
    headers: { authorization: `Bearer ${staffB.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const ids = (list.json() as { tickets: Array<{ id: string }> }).tickets.map((t) => t.id);
  assert.ok(!ids.includes(ticket.id));
});

test("Wave D: cross-tenant invoice GET returns 404", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customerA = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } });
  const staffA = await staffLogin();
  const invoice = await createInvoice({
    tenantId: tenantA.id,
    customerId: customerA.id,
    currency: "NGN",
    lines: [{ description: "Stay", quantity: 1, unitAmount: 5000 }],
    actorKind: "staff",
    actorId: staffA.staff.id,
  });

  const staffB = await staffLogin("waved-b", "admin@waved-b.hotel");
  const peek = await app.inject({
    method: "GET",
    url: `/billing/invoices/${invoice.id}`,
    headers: { authorization: `Bearer ${staffB.token}` },
  });
  assert.equal(peek.statusCode, 404);
});

test("Wave D: cross-tenant media GET returns 404", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const asset = await prisma.mediaAsset.create({
    data: {
      tenantId: tenantA.id,
      url: "https://example.com/private-a.png",
      kind: "image",
      isPublic: false,
    },
  });

  const staffB = await staffLogin("waved-b", "admin@waved-b.hotel");
  const res = await app.inject({
    method: "GET",
    url: `/media/${asset.id}`,
    headers: { authorization: `Bearer ${staffB.token}` },
  });
  assert.equal(res.statusCode, 404);
});

test("Wave D: staff validation errors include requestId", async () => {
  const staff = await staffLogin();
  const res = await app.inject({
    method: "POST",
    url: "/billing/invoices",
    headers: { authorization: `Bearer ${staff.token}` },
    payload: { customerId: "", lines: [] },
  });
  assert.equal(res.statusCode, 400);
  const body = res.json() as { error: string; requestId?: string };
  assert.equal(body.error, "validation_error");
  assert.ok(typeof body.requestId === "string" && body.requestId.length > 0);
  assert.ok(res.headers["x-request-id"]);
});

test("Wave D: enqueueJob + processDueJobs is idempotent for same key", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const key = `wave_d_holds_${tenantA.id}`;
  const first = await enqueueJob({
    tenantId: tenantA.id,
    type: "cinema.release_expired_holds",
    idempotencyKey: key,
    payload: {},
  });
  const second = await enqueueJob({
    tenantId: tenantA.id,
    type: "cinema.release_expired_holds",
    idempotencyKey: key,
    payload: {},
  });
  assert.equal(first.id, second.id);

  const run1 = await processDueJobs();
  assert.ok(run1.processed >= 1);
  const completed = run1.results.find((r) => r.id === first.id);
  assert.ok(completed);
  assert.equal(completed!.status, "completed");

  const run2 = await processDueJobs();
  assert.ok(!run2.results.some((r) => r.id === first.id));

  const count = await prisma.backgroundJob.count({
    where: { tenantId: tenantA.id, type: "cinema.release_expired_holds", idempotencyKey: key },
  });
  assert.equal(count, 1);
});

test("Wave D: branch-scoped staff cannot collect payment for other branch", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } });
  const abuja = await prisma.branch.findFirstOrThrow({
    where: { tenantId: tenantA.id, code: "ABJ" },
  });
  const admin = await staffLogin();
  const invoice = await createInvoice({
    tenantId: tenantA.id,
    customerId: customer.id,
    currency: "NGN",
    lines: [{ description: "Branch pay", quantity: 1, unitAmount: 2000 }],
    actorKind: "staff",
    actorId: admin.staff.id,
  });

  const desk = await staffLogin("waved-a", "lagos@waved-a.hotel");
  const res = await app.inject({
    method: "POST",
    url: "/billing/payments/manual/collect",
    headers: { authorization: `Bearer ${desk.token}` },
    payload: {
      invoiceId: invoice.id,
      amount: 2000,
      methodType: "cash",
      idempotencyKey: `wave_d_branch_${invoice.id}`,
      branchId: abuja.id,
    },
  });
  assert.equal(res.statusCode, 403, res.body);
  assert.equal(res.json().error, "forbidden");
});

test("Wave D: tenant A spa list includes own appointment", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const customerA = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } });
  const treatment = await prisma.treatment.create({
    data: {
      tenantId: tenantA.id,
      name: "Facial",
      code: "FAC-A",
      durationMinutes: 45,
      price: 8000,
      requiredSpecialties: [],
      requiredRoomTypes: [],
      imageUrls: [],
      metadata: {},
      status: "active",
    },
  });
  const startsAt = new Date(Date.now() + 172800000);
  const appointment = await prisma.spaAppointment.create({
    data: {
      tenantId: tenantA.id,
      customerId: customerA.id,
      treatmentId: treatment.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60 * 1000),
      status: "confirmed",
      addonOfferingIds: [],
      notes: null,
    },
  });

  const staffA = await staffLogin();
  const list = await app.inject({
    method: "GET",
    url: "/spa/appointments",
    headers: { authorization: `Bearer ${staffA.token}` },
  });
  assert.equal(list.statusCode, 200);
  const ids = (list.json() as { appointments: Array<{ id: string }> }).appointments.map((a) => a.id);
  assert.ok(ids.includes(appointment.id));
});

test("Wave D: processDueJobs with unknown type marks job dead without throw", async () => {
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { slug: "waved-a" } });
  const job = await enqueueJob({
    tenantId: tenantA.id,
    type: "wave_d.unknown_handler",
    idempotencyKey: `unknown_${Date.now()}`,
    payload: { n: 1 },
  });
  const result = await processDueJobs();
  const row = result.results.find((r) => r.id === job.id);
  assert.ok(row);
  assert.equal(row!.status, "dead");
  const stored = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(stored.status, "dead");
});
