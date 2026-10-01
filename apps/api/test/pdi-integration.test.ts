import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { hashPassword } from "../src/lib/crypto.js";
import { startMockTrustId, type MockTrustId } from "./helpers/mock-trustid.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "../..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");
const GUEST_A = "TID-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GUEST_B = "TID-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STAFF = "TID-cccccccccccccccccccccccccccccccc";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

type Grant = { id: string; ownerId: string; status: string; oneTime: boolean };
type Session = { token: string; ownerId: string; subject: string };
type Infra = { id: string; ownerId: string };
type AppRec = { id: string; infrastructureId: string; credential: string; issued: boolean };
type Conn = { id: string; infrastructureId: string; applicationId: string; ownerId: string; status: string; approvedCapabilities: string[]; authorityGrantRefs: Array<{ grantId: string; capability: string }> };

const world = {
  sessions: new Map<string, Session>(),
  infras: new Map<string, Infra>(),
  apps: new Map<string, AppRec>(),
  connections: new Map<string, Conn>(),
  grants: new Map<string, Grant>(),
  tokens: new Map<string, string>(),
  creates: 0,
  approveAuth: [] as string[],
  approveBodies: [] as string[],
  authorityDown: false,
  credentialRejected: false,
  digiDown: false,
};

function ownerFor(subject: string) {
  return `own_${createHash("sha256").update(subject).digest("hex").slice(0, 24)}`;
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function listen() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const bodyText = req.method === "GET" ? "" : await readBody(req);
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
    const auth = String(req.headers.authorization ?? "");
    if (url.pathname === "/digi-down") return send(res, 503, { code: "DIGI_UNAVAILABLE" });
    if (url.pathname === "/auth/trustid/exchange") {
      if (world.digiDown) return send(res, 503, { code: "DIGI_UNAVAILABLE" });
      const assertion = String(body.assertion ?? "");
      const payload = JSON.parse(Buffer.from(assertion.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: string };
      const subject = payload.sub ?? "";
      const session = { token: `digi_${randomUUID()}`, ownerId: ownerFor(subject), subject };
      world.sessions.set(session.token, session);
      return send(res, 200, { ownerId: session.ownerId, sessionToken: session.token, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (url.pathname === "/authority/token") {
      if (world.authorityDown) return send(res, 503, { code: "AUTHORITY_UNAVAILABLE" });
      const session = world.sessions.get(auth.replace("Bearer ", ""));
      const grant = world.grants.get(String(body.grantId ?? ""));
      if (!session || !grant || grant.ownerId !== session.ownerId || grant.status !== "ACTIVE") return send(res, 400, { code: "GRANT_NOT_ACTIVE" });
      const token = `authtok_${randomUUID()}`;
      world.tokens.set(token, grant.id);
      return send(res, 200, { token });
    }
    if (url.pathname === "/me/pdi" && req.method === "GET") {
      const session = world.sessions.get(auth.replace("Bearer ", ""));
      if (!session) return send(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      const infra = [...world.infras.values()].find((item) => item.ownerId === session.ownerId);
      return send(res, 200, infra ? { state: "ACTIVE", infrastructure: infra } : { state: "NOT_PROVISIONED" });
    }
    if (url.pathname === "/me/pdi" && req.method === "POST") {
      const session = world.sessions.get(auth.replace("Bearer ", ""));
      if (!session) return send(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      world.creates += 1;
      const existing = [...world.infras.values()].find((item) => item.ownerId === session.ownerId);
      if (existing) return send(res, 200, existing);
      const infra = { id: `infra:${randomUUID()}`, ownerId: session.ownerId };
      world.infras.set(infra.id, infra);
      return send(res, 200, infra);
    }
    const appMatch = url.pathname.match(/^\/infrastructures\/([^/]+)\/apps$/);
    if (appMatch && req.method === "POST") {
      const session = world.sessions.get(auth.replace("Bearer ", ""));
      const infra = world.infras.get(decodeURIComponent(appMatch[1]!));
      if (!session || !infra || infra.ownerId !== session.ownerId) return send(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      const existing = [...world.apps.values()].find((item) => item.infrastructureId === infra.id);
      if (existing) return send(res, 200, { id: existing.id });
      const created = { id: `app:${randomUUID()}`, infrastructureId: infra.id, credential: `ddiapp_${randomUUID()}`, issued: true };
      world.apps.set(created.id, created);
      return send(res, 200, { id: created.id, applicationCredential: created.credential });
    }
    const connectMatch = url.pathname.match(/^\/infrastructures\/([^/]+)\/connections$/);
    if (connectMatch && req.method === "POST") {
      const credential = auth.replace("Application ", "");
      const app = [...world.apps.values()].find((item) => item.credential === credential && item.infrastructureId === decodeURIComponent(connectMatch[1]!));
      if (!app || world.credentialRejected) return send(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      const current = [...world.connections.values()].find((item) => item.applicationId === app.id);
      if (current?.status === "ACTIVE") return send(res, 409, { code: "CONNECTION_ALREADY_ACTIVE" });
      if (current) {
        current.status = "REQUESTED";
        current.approvedCapabilities = [];
        current.authorityGrantRefs = [];
        return send(res, 200, current);
      }
      const infra = world.infras.get(app.infrastructureId)!;
      const connection = { id: `connection:${randomUUID()}`, infrastructureId: infra.id, applicationId: app.id, ownerId: infra.ownerId, status: "REQUESTED", approvedCapabilities: [], authorityGrantRefs: [] };
      world.connections.set(connection.id, connection);
      return send(res, 200, connection);
    }
    const approveMatch = url.pathname.match(/^\/connections\/([^/]+)\/approve$/);
    if (approveMatch) {
      world.approveAuth.push(auth);
      world.approveBodies.push(bodyText);
      if (!auth.startsWith("Bearer ")) return send(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      const session = world.sessions.get(auth.replace("Bearer ", ""));
      const connection = world.connections.get(decodeURIComponent(approveMatch[1]!));
      if (!session || !connection || connection.ownerId !== session.ownerId) return send(res, 403, { code: "DENIED" });
      const grant = { id: `auth_${randomUUID().replace(/-/g, "")}`, ownerId: connection.ownerId, status: "ACTIVE", oneTime: false };
      world.grants.set(grant.id, grant);
      connection.status = "ACTIVE";
      connection.approvedCapabilities = ["identity.currentActor"];
      connection.authorityGrantRefs = [{ grantId: grant.id, capability: "identity.currentActor" }];
      return send(res, 200, connection);
    }
    const revokeMatch = url.pathname.match(/^\/connections\/([^/]+)\/revoke$/);
    if (revokeMatch) {
      const session = world.sessions.get(auth.replace("Bearer ", ""));
      const connection = world.connections.get(decodeURIComponent(revokeMatch[1]!));
      if (!session || !connection || connection.ownerId !== session.ownerId) return send(res, 403, { code: "DENIED" });
      connection.status = "REVOKED";
      connection.approvedCapabilities = [];
      for (const ref of connection.authorityGrantRefs) {
        const grant = world.grants.get(ref.grantId);
        if (grant) grant.status = "REVOKED";
      }
      return send(res, 200, connection);
    }
    const getMatch = url.pathname.match(/^\/connections\/([^/]+)$/);
    if (getMatch && req.method === "GET") {
      const connection = world.connections.get(decodeURIComponent(getMatch[1]!));
      const session = world.sessions.get(auth.replace("Bearer ", ""));
      if (!connection || !session || session.ownerId !== connection.ownerId) return send(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      return send(res, 200, connection);
    }
    if (url.pathname === "/capabilities/execute") {
      const credential = auth.replace("Application ", "");
      const app = [...world.apps.values()].find((item) => item.credential === credential);
      if (!app || world.credentialRejected) return send(res, 401, { code: "AUTHENTICATION_REQUIRED" });
      const connection = [...world.connections.values()].find((item) => item.applicationId === app.id);
      if (!connection || connection.status !== "ACTIVE") return send(res, 403, { status: "DENIED", reason: "CONNECTION_NOT_ACTIVE" });
      const grantId = world.tokens.get(String(body.authorityToken ?? ""));
      const grant = grantId ? world.grants.get(grantId) : undefined;
      if (!grant || grant.status !== "ACTIVE" || grant.oneTime !== false) return send(res, 403, { status: "DENIED", reason: "AUTHORITY_DENIED" });
      return send(res, 200, { status: "COMPLETED", data: { ownerId: connection.ownerId }, executionMode: body.executionMode });
    }
    return send(res, 404, { code: "NOT_FOUND" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub failed to listen");
  return { base: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

let app: FastifyInstance;
let mockTrustId: MockTrustId;
let stub: { base: string; close: () => Promise<void> };
const prisma = new PrismaClient();

async function resetDb() {
  await prisma.guestSession.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.assertionExchange.deleteMany().catch(() => undefined);
  await prisma.auditLog.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.$executeRawUnsafe(`DELETE FROM pdi_connection_cache`).catch(() => undefined);
  await prisma.$executeRawUnsafe(`DELETE FROM pdi_application_vault`).catch(() => undefined);
  await prisma.$executeRawUnsafe(`DELETE FROM pdi_session_vault`).catch(() => undefined);
  await prisma.$executeRawUnsafe(`DELETE FROM pdi_identity_links`).catch(() => undefined);
  const org = await prisma.organization.create({ data: { name: "PDI Org", slug: "pdi-org", metadata: {} } });
  const tenant = await prisma.tenant.create({
    data: { organizationId: org.id, name: "Sunrise Hotel", slug: "sunrise-hotel", status: "active", businessType: "hotel", operatingHours: [], settings: {} },
  });
  await prisma.branch.create({ data: { tenantId: tenant.id, name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC", status: "active" } });
  await prisma.staffMember.create({
    data: { tenantId: tenant.id, displayName: "Staff", email: "staff@sunrise.test", passwordHash: hashPassword("password123"), role: "owner", branchIds: [], status: "active", trustId: STAFF, externalIdentityRef: STAFF },
  });
}

async function login(sub: string, path = "/auth/guest/trustid/exchange") {
  const assertion = await mockTrustId.issueAssertion({ sub, aud: "hospitalityos", display_name: "Guest" });
  const response = await app.inject({ method: "POST", url: path, payload: { assertion, tenantSlug: "sunrise-hotel" } });
  assert.equal(response.statusCode, 200, response.body);
  return { token: response.json().token as string, assertion, body: response.json() };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

before(async () => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  execSync("npx prisma db push --skip-generate", { cwd: apiRoot, env: { ...process.env, DATABASE_URL: "file:./test.db" }, stdio: "pipe" });
  mockTrustId = await startMockTrustId();
  stub = await listen();
  config.trustidApiUrl = mockTrustId.baseUrl;
  config.trustidJwksUrl = mockTrustId.jwksUrl;
  config.trustidIssuer = "trustid";
  config.trustidAudience = "hospitalityos";
  process.env.DIGI_CORE_BASE_URL = stub.base;
  process.env.DDI_BASE_URL = stub.base;
  app = await buildApp();
});

after(async () => {
  await app.close();
  await mockTrustId.close();
  await stub.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  world.sessions.clear();
  world.infras.clear();
  world.apps.clear();
  world.connections.clear();
  world.grants.clear();
  world.tokens.clear();
  world.approveAuth = [];
  world.approveBodies = [];
  world.creates = 0;
  world.authorityDown = false;
  world.credentialRejected = false;
  world.digiDown = false;
  process.env.DIGI_CORE_BASE_URL = stub.base;
  process.env.DDI_BASE_URL = stub.base;
  await resetDb();
});

test("TrustID login succeeds when Digi Core is down and does not create a PDI", async () => {
  world.digiDown = true;
  const guest = await login(GUEST_A);
  assert.equal(guest.body.customer.trustId, GUEST_A);
  assert.notEqual(guest.body.customer.id, ownerFor(GUEST_A));
  const me = await app.inject({ method: "GET", url: "/auth/guest/me", headers: auth(guest.token) });
  assert.equal(me.statusCode, 200);
  const surface = await app.inject({ method: "GET", url: "/guest/pdi", headers: auth(guest.token) });
  assert.equal(surface.statusCode, 200);
  assert.equal(surface.json().digi, "UNAVAILABLE");
  assert.equal(world.creates, 0);
  assert.equal(JSON.stringify(surface.json()).includes("login failed"), false);
});

test("first human creates a PDI only by explicit action, consents once, and executes current actor", async () => {
  const first = await login(GUEST_A);
  const before = await app.inject({ method: "GET", url: "/guest/pdi?diagnostics=1", headers: auth(first.token) });
  assert.equal(before.json().infrastructure, "NOT_PROVISIONED");
  assert.equal(before.json().connection, "NOT_CONNECTED");
  assert.equal(world.creates, 0);
  assert.notEqual(before.json().diagnostics.trustIdSubject, before.json().diagnostics.digiOwnerId);
  assert.notEqual(before.json().diagnostics.hospitalityActorId, before.json().diagnostics.digiOwnerId);
  const created = await app.inject({ method: "POST", url: "/guest/pdi", headers: auth(first.token) });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().infrastructure, "ACTIVE");
  assert.equal(created.json().connection, "NOT_CONNECTED");
  assert.equal(world.creates, 1);
  const connected = await app.inject({ method: "POST", url: "/guest/pdi/connect", headers: auth(first.token) });
  assert.equal(connected.json().connection, "REQUESTED");
  assert.equal([...world.connections.values()][0]?.approvedCapabilities.length, 0);
  assert.equal([...world.connections.values()][0]?.authorityGrantRefs.length, 0);
  const approved = await app.inject({ method: "POST", url: "/guest/pdi/approve", headers: auth(first.token) });
  assert.equal(approved.json().connection, "ACTIVE");
  assert.equal(world.approveAuth[0]?.startsWith("Bearer "), true);
  assert.equal(world.approveAuth.some((header) => header.startsWith("Application ")), false);
  assert.equal(world.grants.size, 1);
  assert.equal([...world.grants.values()][0]?.oneTime, false);
  const executed = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: auth(first.token), payload: { executionMode: "APP" } });
  assert.equal(executed.json().execution.status, "COMPLETED");
  assert.equal(executed.json().execution.ownerId, before.json().diagnostics.digiOwnerId);
  const space = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: auth(first.token), payload: { executionMode: "SPACE" } });
  assert.equal(space.json().execution.status, "COMPLETED");
  assert.equal(world.grants.size, 1);
  const hidden = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: auth(first.token), payload: { executionMode: "APP" } });
  assert.equal(hidden.json().execution.ownerId, undefined);
  assert.equal(world.grants.size, 1);

  const second = await login(GUEST_A);
  assert.notEqual(second.token, first.token);
  const again = await app.inject({ method: "GET", url: "/guest/pdi?diagnostics=1", headers: auth(second.token) });
  assert.equal(again.json().diagnostics.digiOwnerId, before.json().diagnostics.digiOwnerId);
  assert.equal(again.json().connection, "ACTIVE");
  assert.equal(world.creates, 1);
  const repeat = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: auth(second.token), payload: { executionMode: "APP" } });
  assert.equal(repeat.json().execution.status, "COMPLETED");
  assert.equal(world.grants.size, 1);
  assert.equal(world.approveAuth.length, 1);

  const other = await login(GUEST_B);
  const otherSurface = await app.inject({ method: "GET", url: "/guest/pdi?diagnostics=1", headers: auth(other.token) });
  assert.equal(otherSurface.json().infrastructure, "NOT_PROVISIONED");
  assert.notEqual(otherSurface.json().diagnostics.digiOwnerId, before.json().diagnostics.digiOwnerId);
  const stolen = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: auth(other.token) });
  assert.notEqual(stolen.json().execution?.status, "COMPLETED");
  assert.equal(world.grants.size, 1);

  const revoked = await app.inject({ method: "POST", url: "/guest/pdi/revoke", headers: auth(second.token) });
  assert.equal(revoked.json().connection, "REVOKED");
  assert.equal([...world.grants.values()].every((grant) => grant.status === "REVOKED"), true);
  const still = await app.inject({ method: "GET", url: "/auth/guest/me", headers: auth(second.token) });
  assert.equal(still.statusCode, 200);
  const denied = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: auth(second.token) });
  assert.equal(denied.json().execution.status, "DENIED");
  assert.equal(denied.json().execution.reason, "CONNECTION_NOT_ACTIVE");
  const reconnect = await app.inject({ method: "POST", url: "/guest/pdi/connect", headers: auth(second.token) });
  assert.equal(reconnect.json().connection, "REQUESTED");
  const reapproved = await app.inject({ method: "POST", url: "/guest/pdi/approve", headers: auth(second.token) });
  assert.equal(reapproved.json().connection, "ACTIVE");
  assert.equal([...world.grants.values()].filter((grant) => grant.status === "ACTIVE").length, 1);
  assert.equal([...world.grants.values()].filter((grant) => grant.status === "REVOKED").length, 1);
  const restored = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: auth(second.token) });
  assert.equal(restored.json().execution.status, "COMPLETED");
  assert.equal(restored.json().execution.ownerId, before.json().diagnostics.digiOwnerId);
});

test("staff TrustID login keeps a distinct staff id and can see an unprovisioned PDI", async () => {
  const staff = await login(STAFF, "/auth/staff/trustid/exchange");
  assert.notEqual(staff.body.staff.id, ownerFor(STAFF));
  const surface = await app.inject({ method: "GET", url: "/staff/pdi?diagnostics=1", headers: auth(staff.token) });
  assert.equal(surface.json().infrastructure, "NOT_PROVISIONED");
  assert.equal(surface.json().diagnostics.hospitalityActorId, staff.body.staff.id);
  assert.equal(world.creates, 0);
});

test("DDI, Authority, and credential failures stay infrastructure failures", async () => {
  const guest = await login(GUEST_A);
  await app.inject({ method: "POST", url: "/guest/pdi", headers: auth(guest.token) });
  await app.inject({ method: "POST", url: "/guest/pdi/connect", headers: auth(guest.token) });
  await app.inject({ method: "POST", url: "/guest/pdi/approve", headers: auth(guest.token) });
  world.authorityDown = true;
  const authority = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: auth(guest.token) });
  assert.equal(authority.statusCode, 503);
  assert.equal(authority.json().code, "AUTHORITY_UNAVAILABLE");
  assert.equal(JSON.stringify(authority.json()).toLowerCase().includes("login failed"), false);
  world.authorityDown = false;
  world.credentialRejected = true;
  const credential = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: auth(guest.token) });
  assert.equal(credential.statusCode, 401);
  assert.equal(credential.json().code, "APPLICATION_CREDENTIAL_REJECTED");
  const me = await app.inject({ method: "GET", url: "/auth/guest/me", headers: auth(guest.token) });
  assert.equal(me.statusCode, 200);
  process.env.DDI_BASE_URL = "http://127.0.0.1:9";
  const down = await app.inject({ method: "GET", url: "/guest/pdi", headers: auth(guest.token) });
  assert.equal(down.json().infrastructure, "UNAVAILABLE");
  assert.equal(JSON.stringify(down.json()).toLowerCase().includes("user does not exist"), false);
});

test("responses, audits, and the guest bundle do not contain infrastructure secrets", async () => {
  const guest = await login(GUEST_A);
  await app.inject({ method: "POST", url: "/guest/pdi", headers: auth(guest.token) });
  await app.inject({ method: "POST", url: "/guest/pdi/connect", headers: auth(guest.token) });
  await app.inject({ method: "POST", url: "/guest/pdi/approve", headers: auth(guest.token) });
  const executed = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: auth(guest.token) });
  const secret = [...world.apps.values()][0]?.credential ?? "";
  const digiToken = [...world.sessions.keys()][0] ?? "";
  assert.equal(executed.body.includes(secret), false);
  assert.equal(executed.body.includes(digiToken), false);
  assert.equal(executed.body.includes(guest.assertion), false);
  const audits = await prisma.auditLog.findMany();
  const auditText = JSON.stringify(audits);
  assert.equal(auditText.includes(secret), false);
  assert.equal(auditText.includes(digiToken), false);
  assert.equal(auditText.includes(guest.assertion), false);
  assert.equal(auditText.includes("authtok_"), false);
  const vault = await prisma.$queryRaw<Array<{ credential_cipher: string; session_cipher: string }>>`
    SELECT a.credential_cipher, s.session_cipher
    FROM pdi_application_vault a, pdi_session_vault s
  `;
  assert.equal(vault[0]?.credential_cipher.includes(secret), false);
  assert.equal(vault[0]?.session_cipher.includes(digiToken), false);
  const ui = fs.readFileSync(path.join(repoRoot, "apps/guest-pwa/src/components/PdiPanel.tsx"), "utf8");
  const session = fs.readFileSync(path.join(repoRoot, "apps/guest-pwa/src/lib/session.ts"), "utf8");
  assert.equal(ui.includes("ddiapp_"), false);
  assert.equal(ui.includes("localStorage"), false);
  assert.equal(session.includes("digi"), false);
});
