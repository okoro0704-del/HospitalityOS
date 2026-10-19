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
import { startMockTrustId, type MockTrustId } from "./helpers/mock-trustid.js";
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
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

let app: FastifyInstance;
let mockTrustId: MockTrustId;
const prisma = new PrismaClient();

const TID = "TID-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function resetDb() {
  await clearBillingModule(prisma);
  await clearNotificationsModule(prisma);
  await clearCrmModule(prisma);
  await clearOperationsModule(prisma);
  await clearCinemaModule(prisma);
  await clearEventsModule(prisma);
  await clearSpaModule(prisma);
  await clearFitnessModule(prisma);
  await clearDiningModule(prisma);
  await clearCommerceEngine(prisma);
  await clearBookingEngine(prisma);
  await prisma.guestSession.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();

  const hours = [
    { day: "mon", open: "09:00", close: "17:00", closed: false },
  ];

  const org = await prisma.organization.create({
    data: { name: "TrustID Test Org", slug: "trustid-org", metadata: {} },
  });
  const tenant = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      name: "Sunrise Hotel",
      slug: "sunrise-hotel",
      status: "active",
      businessType: "hotel",
      operatingHours: hours,
      settings: {},
    },
  });
  await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: "Main",
      code: "MAIN",
      isPrimary: true,
      timezone: "UTC",
      status: "active",
    },
  });
  await prisma.staffMember.create({
    data: {
      tenantId: tenant.id,
      displayName: "Owner",
      email: "owner@sunrise.test",
      passwordHash: hashPassword("password123"),
      role: "owner",
      branchIds: [],
      status: "active",
      trustId: TID,
      externalIdentityRef: TID,
    },
  });
  await prisma.tenant.create({
    data: {
      organizationId: org.id,
      name: "Bella Restaurant",
      slug: "bella-restaurant",
      status: "active",
      businessType: "restaurant",
      operatingHours: hours,
      settings: {},
    },
  });
}

before(async () => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  mockTrustId = await startMockTrustId();
  config.trustidApiUrl = mockTrustId.baseUrl;
  config.trustidJwksUrl = mockTrustId.jwksUrl;
  config.trustidIssuer = "trustid";
  config.trustidAudience = "hospitalityos";
  app = await buildApp();
});

after(async () => {
  await app.close();
  await mockTrustId.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

test("guest TrustID exchange creates tenant-scoped customer with TID ref", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    display_name: "Alex Guest",
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.trustId, TID);
  assert.equal(body.customer.externalIdentityRef, TID);
  assert.equal(body.customer.trustId, TID);
  assert.ok(body.token);
});

test("same TrustID links independently at two tenants (no shared customer DB)", async () => {
  const a1 = await mockTrustId.issueAssertion({ sub: TID, aud: "hospitalityos", display_name: "Alex" });
  const r1 = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion: a1, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(r1.statusCode, 200);

  const a2 = await mockTrustId.issueAssertion({ sub: TID, aud: "hospitalityos", display_name: "Alex" });
  const r2 = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion: a2, tenantSlug: "bella-restaurant" },
  });
  assert.equal(r2.statusCode, 200);
  assert.notEqual(r1.json().customer.id, r2.json().customer.id);
  assert.equal(r1.json().customer.trustId, r2.json().customer.trustId);
});

test("reuses existing customer on duplicate TrustID link within tenant", async () => {
  const a1 = await mockTrustId.issueAssertion({ sub: TID, aud: "hospitalityos" });
  const r1 = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion: a1, tenantSlug: "sunrise-hotel" },
  });
  const a2 = await mockTrustId.issueAssertion({ sub: TID, aud: "hospitalityos" });
  const r2 = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion: a2, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(r1.json().customer.id, r2.json().customer.id);
});

test("rejects expired TrustID assertion", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    expSeconds: 0,
  });
  await new Promise((r) => setTimeout(r, 50));
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 401);
  assert.ok(["token_expired", "invalid_token"].includes(res.json().error));
});

test("rejects wrong audience", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "lifeos",
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 401);
  assert.ok(
    ["wrong_audience", "invalid_token"].includes(res.json().error),
    `unexpected error: ${res.body}`,
  );
});

test("rejects wrong issuer", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    issuer: "evil-idp",
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 401);
});

test("rejects replayed assertion", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    jti: "replay-jti-1",
  });
  const first = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(first.statusCode, 200);
  const second = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(second.statusCode, 401);
  assert.equal(second.json().error, "replay");
});

test("staff TrustID login requires linked membership (auth ≠ authz)", async () => {
  const otherTid = "TID-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const assertion = await mockTrustId.issueAssertion({
    sub: otherTid,
    aud: "hospitalityos",
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "not_staff");
});

test("linked staff can exchange TrustID assertion", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    display_name: "Owner",
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().trustId, TID);
  assert.ok(res.json().permissions.length > 0);
});

test("cross-tenant staff TrustID does not grant access", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/trustid/exchange",
    payload: { assertion, tenantSlug: "bella-restaurant" },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "not_staff");
});

test("password staff login still works (backwards compatible)", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: {
      tenantSlug: "sunrise-hotel",
      email: "owner@sunrise.test",
      password: "password123",
    },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().token);
});
