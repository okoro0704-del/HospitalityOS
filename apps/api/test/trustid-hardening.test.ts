import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
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
import {
  clearTrustIdReplayCache,
  setTrustIdTestGetKey,
  verifyTrustIdAssertion,
} from "../src/lib/trustid.js";
import { generateKeyPair, exportJWK, SignJWT, importJWK } from "jose";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

let app: FastifyInstance;
let mockTrustId: MockTrustId;
const prisma = new PrismaClient();

const TID = "TID-cccccccccccccccccccccccccccccccc";
const TID_OTHER = "TID-dddddddddddddddddddddddddddddddd";

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
  await prisma.stepUpChallenge.deleteMany().catch(() => undefined);
  await prisma.assertionExchange.deleteMany().catch(() => undefined);
  await prisma.staffIdentityLink.deleteMany().catch(() => undefined);
  await prisma.guestSession.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();
  clearTrustIdReplayCache();

  const hours = [{ day: "mon", open: "09:00", close: "17:00", closed: false }];
  const org = await prisma.organization.create({
    data: { name: "Hardening Org", slug: "hardening-org", metadata: {} },
  });
  const hotel = await prisma.tenant.create({
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
  const bella = await prisma.tenant.create({
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
  await prisma.branch.create({
    data: {
      tenantId: hotel.id,
      name: "Main",
      code: "MAIN",
      isPrimary: true,
      timezone: "UTC",
      status: "active",
    },
  });
  const staff = await prisma.staffMember.create({
    data: {
      tenantId: hotel.id,
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
  await prisma.staffIdentityLink.create({
    data: {
      tenantId: hotel.id,
      staffId: staff.id,
      trustId: TID,
      status: "active",
      verifiedAt: new Date(),
      metadata: {},
    },
  });
  await prisma.staffMember.create({
    data: {
      tenantId: hotel.id,
      displayName: "Disabled Desk",
      email: "disabled@sunrise.test",
      passwordHash: hashPassword("password123"),
      role: "front_desk",
      branchIds: [],
      status: "disabled",
      trustId: TID_OTHER,
      externalIdentityRef: TID_OTHER,
    },
  });
  void bella;
}

before(async () => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
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
  setTrustIdTestGetKey(null);
  await app.close();
  await mockTrustId.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

test("auth≠authz: unknown TrustID staff gets forbidden", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: "TID-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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

test("disabled staff membership cannot TrustID login", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID_OTHER,
    aud: "hospitalityos",
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 403);
});

test("wrong tenant staff TrustID denied without revealing other membership", async () => {
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

test("guest TID IDOR: tenant B cannot discover tenant A customer by TID", async () => {
  const a1 = await mockTrustId.issueAssertion({ sub: TID, aud: "hospitalityos" });
  const r1 = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion: a1, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(r1.statusCode, 200);
  const customerId = r1.json().customer.id as string;

  const bellaStaff = await prisma.staffMember.create({
    data: {
      tenantId: (await prisma.tenant.findUniqueOrThrow({ where: { slug: "bella-restaurant" } })).id,
      displayName: "Bella Admin",
      email: "admin@bella.test",
      passwordHash: hashPassword("password123"),
      role: "admin",
      branchIds: [],
      status: "active",
    },
  });
  void bellaStaff;

  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: {
      tenantSlug: "bella-restaurant",
      email: "admin@bella.test",
      password: "password123",
    },
  });
  assert.equal(login.statusCode, 200);
  const token = login.json().token as string;

  const cross = await app.inject({
    method: "GET",
    url: `/customers/${customerId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.ok([404, 403].includes(cross.statusCode));
});

test("mass-assignment of trustId on staff patch is rejected", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: {
      tenantSlug: "sunrise-hotel",
      email: "owner@sunrise.test",
      password: "password123",
    },
  });
  const token = login.json().token as string;
  const staffId = login.json().staff.id as string;
  const res = await app.inject({
    method: "PATCH",
    url: `/staff/${staffId}`,
    headers: { authorization: `Bearer ${token}` },
    payload: { trustId: "TID-ffffffffffffffffffffffffffffffff", displayName: "Hacker" },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});

test("legacy password login is labeled LEGACY_DEVELOPMENT", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: {
      tenantSlug: "sunrise-hotel",
      email: "owner@sunrise.test",
      password: "password123",
    },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().authClassification, "LEGACY_DEVELOPMENT");
  assert.equal(login.json().authProvider, "legacy_password");

  const me = await app.inject({
    method: "GET",
    url: "/auth/staff/me",
    headers: { authorization: `Bearer ${login.json().token}` },
  });
  assert.equal(me.json().authClassification, "LEGACY_DEVELOPMENT");
});

test("TrustID staff login sets authProvider trustid on me", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
  });
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().authProvider, "trustid");
  const me = await app.inject({
    method: "GET",
    url: "/auth/staff/me",
    headers: { authorization: `Bearer ${login.json().token}` },
  });
  assert.equal(me.json().trustIdVerified, true);
  assert.equal(me.json().authProvider, "trustid");
});

test("session revoke webhook invalidates HOS staff session", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    jti: "revoke-jti-1",
  });
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(login.statusCode, 200);
  const token = login.json().token as string;

  const body = { jti: "revoke-jti-1", reason: "test" };
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", config.webhookSecret).update(raw).digest("hex");
  const wh = await app.inject({
    method: "POST",
    url: "/webhooks/trustid/session-revoked",
    headers: { "x-trustid-signature": `sha256=${sig}`, "content-type": "application/json" },
    payload: body,
  });
  assert.equal(wh.statusCode, 200);
  assert.ok(wh.json().staffSessions >= 1);

  const me = await app.inject({
    method: "GET",
    url: "/auth/staff/me",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(me.statusCode, 401);
});

test("step-up challenge then satisfy", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
  });
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  const token = login.json().token as string;

  const challengeRes = await app.inject({
    method: "POST",
    url: "/auth/staff/step-up/challenge",
    headers: { authorization: `Bearer ${token}` },
    payload: { action: "refund" },
  });
  assert.equal(challengeRes.statusCode, 403);
  assert.equal(challengeRes.json().error, "step_up_required");
  const challengeId = challengeRes.json().challenge.challengeId as string;

  const stepUp = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    assertion_type: "step_up",
    step_up_for: "refund",
    scopes: ["openid", "step_up"],
  });
  const sat = await app.inject({
    method: "POST",
    url: "/auth/staff/step-up/satisfy",
    headers: { authorization: `Bearer ${token}` },
    payload: { challengeId, assertion: stepUp },
  });
  assert.equal(sat.statusCode, 200);
  assert.equal(sat.json().ok, true);
});

test("alg confusion rejected", async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const bad = await new SignJWT({
    sid: "s",
    app_id: "a",
    scopes: ["openid"],
    ver: "1",
  })
    .setProtectedHeader({ alg: "RS256", kid: "evil", typ: "JWT" })
    .setIssuer("trustid")
    .setSubject(TID)
    .setAudience("hospitalityos")
    .setIssuedAt()
    .setExpirationTime("2m")
    .setJti("alg-confusion")
    .sign(privateKey);

  const result = await verifyTrustIdAssertion({
    assertion: bad,
    expectedAudience: "hospitalityos",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(["alg_confusion", "invalid_token", "invalid_signature"].includes(result.code));
  }
});

test("unknown signing key rejected", async () => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "attacker-key";
  jwk.alg = "EdDSA";
  // Do NOT inject into JWKS — client-supplied keys must never be trusted.
  // Sign with attacker key that is not in TrustID JWKS.
  const token = await new SignJWT({
    sid: "s",
    app_id: "a",
    scopes: ["openid"],
    ver: "1",
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "attacker-key", typ: "JWT" })
    .setIssuer("trustid")
    .setSubject(TID)
    .setAudience("hospitalityos")
    .setIssuedAt()
    .setExpirationTime("2m")
    .setJti("evil-key")
    .sign(privateKey);

  const result = await verifyTrustIdAssertion({
    assertion: token,
    expectedAudience: "hospitalityos",
    jwksUrl: mockTrustId.jwksUrl,
  });
  assert.equal(result.ok, false);
  void importJWK;
});

test("missing scope rejected", async () => {
  const assertion = await mockTrustId.issueAssertion({
    sub: TID,
    aud: "hospitalityos",
    scopes: ["profile"], // no openid
  });
  const res = await app.inject({
    method: "POST",
    url: "/auth/guest/trustid/exchange",
    payload: { assertion, tenantSlug: "sunrise-hotel" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "missing_scope");
});
