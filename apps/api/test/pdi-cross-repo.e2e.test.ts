import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createSecretKey, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import type { FastifyInstance } from "fastify";

const databaseUrl = process.env.DDI_TEST_DATABASE_URL ?? "";
const ISSUER = "https://trustedid.netlify.app/api";
const AUDIENCE = "digiconomy:digi";
const DDI_ROOT = process.env.PDI_DDI_ROOT ?? "C:/Users/Hp/Desktop/DDI";
const TRUST_ROOT = process.env.PDI_TRUSTID_ROOT ?? "C:/Users/Hp/Desktop/TRUST ID";
const ELFCOM_ROOT = process.env.PDI_ELFCOM_ROOT ?? "C:/Users/Hp/Desktop/ELFCOMS";
const DDI_SCHEMA = "hos_ddi_e2e";
const DIGI_SCHEMA = "hos_digi_e2e";
const AUTHORITY_SCHEMA = "hos_authority_e2e";
const GUEST_A = "TID-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GUEST_B = "TID-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Tapped = { ownerId: string; sessionToken: string; assertion: string };
const sessions: Tapped[] = [];
const approveBodies: string[] = [];
const connectionBodies: Array<{ status?: string; approvedCapabilities?: string[]; authorityGrantRefs?: Array<{ grantId: string; capability: string }> }> = [];
const registerBodies: Array<{ applicationCredential?: string }> = [];

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("PDI proof only runs against a local disposable database");
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

let app: FastifyInstance;
let prisma: PrismaClient;
let pool: Pool;
let digiBase = "";
let ddiBase = "";
let privateKey: CryptoKey;
const closers: Array<() => Promise<void>> = [];
const ELFCOM_PORT = 18793;
const ELFCOM_TOKEN = "hos-pdi-elfcom-proof-token";
let elfcom: ChildProcess | undefined;
const activeJtis = new Set<string>();

async function issue(subject: string) {
  const jti = randomUUID();
  activeJtis.add(jti);
  return new SignJWT({
    sid: randomUUID(),
    app_id: "app_hos",
    scopes: ["openid", "profile"],
    assertion_type: "authentication",
    display_name: "Guest",
    ver: "1",
  }).setProtectedHeader({ alg: "EdDSA", kid: "trustid-proof" }).setIssuer(ISSUER).setSubject(subject).setAudience([AUDIENCE, "hospitalityos"]).setIssuedAt().setExpirationTime("2m").setJti(jti).sign(privateKey);
}

before(async () => {
  if (!databaseUrl) throw new Error("DDI_TEST_DATABASE_URL_REQUIRED");
  assertLocal(databaseUrl);
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 20000 });
  await admin.query(`DROP SCHEMA IF EXISTS ${DDI_SCHEMA} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${DIGI_SCHEMA} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${AUTHORITY_SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${DDI_SCHEMA}`);
  await admin.query(`CREATE SCHEMA ${AUTHORITY_SCHEMA}`);
  await admin.end();
  pool = new Pool({ connectionString: databaseUrl, max: 8, connectionTimeoutMillis: 20000, options: `-c search_path=${DDI_SCHEMA}` });
  const { migrate } = await import(pathToFileURL(path.join(DDI_ROOT, "packages/service/src/postgres.ts")).href) as { migrate(pool: Pool, file: string): Promise<void> };
  await migrate(pool, path.join(DDI_ROOT, "migrations/001_ddi_foundation.sql"));
  await migrate(pool, path.join(DDI_ROOT, "migrations/002_ddi_runtime.sql"));
  await migrate(pool, path.join(DDI_ROOT, "migrations/003_pdi_connections.sql"));
  const { PostgresDdiRepository } = await import(pathToFileURL(path.join(DDI_ROOT, "packages/service/src/postgres-repository.ts")).href) as { PostgresDdiRepository: new (pool: Pool) => unknown };
  const { HttpDigiAuthorityClient, HttpDigiAuthorityGrantClient, HttpDigiSessionClient } = await import(pathToFileURL(path.join(DDI_ROOT, "packages/service/src/digi.ts")).href) as {
    HttpDigiAuthorityClient: new (options: { consumeUrl: string; jwksUrl: string; verifierModuleUrl: string }) => unknown;
    HttpDigiAuthorityGrantClient: new (base: string) => unknown;
    HttpDigiSessionClient: new (base: string) => unknown;
  };
  const { DurableDdiService, authorityVerifier, defaultAdapters } = await import(pathToFileURL(path.join(DDI_ROOT, "packages/service/src/runtime.ts")).href) as {
    DurableDdiService: new (repository: unknown, authority: unknown, adapters: Map<string, unknown>, sessions: unknown, grants: unknown) => unknown;
    authorityVerifier(client: unknown): unknown;
    defaultAdapters(verify: (assertion: string) => Promise<{ subject?: string } | null>): Map<string, unknown>;
  };
  const { buildApi } = await import(pathToFileURL(path.join(DDI_ROOT, "apps/api/src/app.ts")).href) as { buildApi(options: { service: unknown; config: unknown }): { listen(options: { port: number; host: string }): Promise<string>; close(): Promise<void> } };
  const { readConfig } = await import(pathToFileURL(path.join(DDI_ROOT, "packages/service/src/config.ts")).href) as { readConfig(env: Record<string, string>): unknown };
  const bridge = await import(pathToFileURL(path.join(TRUST_ROOT, "packages/digi-bridge/dist/index.js")).href) as { openPostgresDigiCore(url: string, options: { schema: string }): Promise<{ owners: unknown; replay: unknown; sessions: unknown; runWrite: unknown; close(): Promise<void> }> };
  const authorityPackage = await import(pathToFileURL(path.join(TRUST_ROOT, "packages/digi-authority/dist/index.js")).href) as { PostgresAuthorityStore: new (url: string) => { close(): Promise<void> } };
  const digiApp = await import(pathToFileURL(path.join(TRUST_ROOT, "apps/digi-rp/dist/app.js")).href) as { buildDigiRp(options: Record<string, unknown>): Promise<{ app: { listen(options: { port: number; host: string }): Promise<string>; close(): Promise<void> } }> };
  const core = await bridge.openPostgresDigiCore(databaseUrl, { schema: DIGI_SCHEMA });
  closers.push(() => core.close());
  const authorityUrl = new URL(databaseUrl);
  authorityUrl.searchParams.set("options", `-c search_path=${AUTHORITY_SCHEMA}`);
  const authorityStore = new authorityPackage.PostgresAuthorityStore(authorityUrl.toString());
  closers.push(() => authorityStore.close());
  const keys = await generateKeyPair("EdDSA", { extractable: true });
  privateKey = keys.privateKey;
  const publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = "trustid-proof";
  publicJwk.alg = "EdDSA";
  const privateJwk = await exportJWK(keys.privateKey);
  privateJwk.kid = "hos-pdi-e2e";
  privateJwk.alg = "EdDSA";
  const stub = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && url.pathname === "/.well-known/jwks.json") { res.end(JSON.stringify({ keys: [publicJwk] })); return; }
    const active = url.pathname.match(/^\/sessions\/([^/]+)\/active$/);
    if (req.method === "GET" && active) { res.end(JSON.stringify({ active: activeJtis.has(decodeURIComponent(active[1]!)) })); return; }
    if (req.method === "POST" && url.pathname === "/assertions/consume") { await readBody(req); res.end(JSON.stringify({ ok: true })); return; }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const stubAddress = stub.address();
  if (!stubAddress || typeof stubAddress === "string") throw new Error("assertion stub failed");
  const stubBase = `http://127.0.0.1:${stubAddress.port}`;
  closers.push(() => new Promise((resolve, reject) => stub.close((error) => error ? reject(error) : resolve())));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousKey = process.env.DIGI_AUTHORITY_PRIVATE_JWK;
  process.env.NODE_ENV = "production";
  process.env.DIGI_AUTHORITY_PRIVATE_JWK = JSON.stringify(privateJwk);
  let digi: Awaited<ReturnType<typeof digiApp.buildDigiRp>>;
  try {
    digi = await digiApp.buildDigiRp({
      trustIdIssuer: ISSUER,
      jwksUrl: `${ISSUER}/jwks`,
      digiAudience: AUDIENCE,
      cookieSecret: "hospitality-pdi-cookie-secret-32",
      corsOrigins: [],
      owners: core.owners,
      replay: core.replay,
      sessions: core.sessions,
      runWrite: core.runWrite,
      authorityStore,
      authorityPersistence: "postgres",
      fetchImpl: (async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousKey === undefined) delete process.env.DIGI_AUTHORITY_PRIVATE_JWK;
    else process.env.DIGI_AUTHORITY_PRIVATE_JWK = previousKey;
  }
  digiBase = await digi.app.listen({ port: 0, host: "127.0.0.1" });
  closers.push(() => digi.app.close());
  const elfcomEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", ELFCOM_PORT: String(ELFCOM_PORT), ELFCOM_PDI_SERVICE_TOKEN: ELFCOM_TOKEN };
  delete elfcomEnv.DATABASE_URL;
  elfcom = spawn(process.execPath, [path.join(ELFCOM_ROOT, "node_modules/tsx/dist/cli.mjs"), "src/index.ts"], { cwd: path.join(ELFCOM_ROOT, "apps/elfcom-node"), env: elfcomEnv, stdio: ["ignore", "pipe", "pipe"] });
  let elfcomLog = "";
  elfcom.stdout?.on("data", (chunk) => { elfcomLog += String(chunk); });
  elfcom.stderr?.on("data", (chunk) => { elfcomLog += String(chunk); });
  const elfcomStarted = Date.now();
  while (!elfcomLog.includes("listening") && Date.now() - elfcomStarted < 60000) {
    if (elfcom.exitCode !== null) throw new Error(elfcomLog.slice(-1000));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!elfcomLog.includes("listening")) throw new Error(elfcomLog.slice(-1000));
  closers.push(async () => { elfcom?.kill("SIGTERM"); });
  process.env.ELFCOM_BASE_URL = `http://127.0.0.1:${ELFCOM_PORT}`;
  process.env.ELFCOM_PDI_SERVICE_TOKEN = ELFCOM_TOKEN;
  const repository = new PostgresDdiRepository(pool);
  const grants = new HttpDigiAuthorityGrantClient(digiBase);
  const consume = new HttpDigiAuthorityClient({ consumeUrl: `${digiBase}/v1/authority/consume`, jwksUrl: `${digiBase}/.well-known/authority-jwks.json`, verifierModuleUrl: pathToFileURL(path.join(TRUST_ROOT, "packages/authority-verifier/dist/index.js")).href });
  const service = new DurableDdiService(repository, authorityVerifier(consume), defaultAdapters(async () => ({ subject: "hos-pdi" })), new HttpDigiSessionClient(digiBase), grants);
  const api = buildApi({ service, config: readConfig({ DDI_ENV: "test", DDI_ALLOWED_ORIGINS: "https://app.example.test" }) });
  ddiBase = await api.listen({ port: 0, host: "127.0.0.1" });
  closers.push(() => api.close());
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const response = await original(input, init);
    if (target.startsWith(digiBase) && target.endsWith("/auth/trustid/exchange")) {
      const body = await response.clone().json() as { ownerId?: string; sessionToken?: string };
      const request = JSON.parse(String(init?.body ?? "{}")) as { assertion?: string };
      if (body.ownerId && body.sessionToken) sessions.push({ ownerId: body.ownerId, sessionToken: body.sessionToken, assertion: request.assertion ?? "" });
    }
    if (target.startsWith(digiBase) && target.includes("/authority/requests/") && target.endsWith("/approve")) approveBodies.push(String(init?.body ?? ""));
    if (target.startsWith(ddiBase) && target.includes("/connections/") && target.endsWith("/approve")) connectionBodies.push(await response.clone().json());
    if (target.startsWith(ddiBase) && target.endsWith("/apps")) registerBodies.push(await response.clone().json());
    return response;
  }) as typeof fetch;
  closers.push(async () => { globalThis.fetch = original; });
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./pdi-e2e.db";
  const sqliteFile = path.resolve(apiRoot, "prisma", path.basename(process.env.DATABASE_URL.replace(/^file:/, "")));
  if (existsSync(sqliteFile)) {
    const sqlite = new DatabaseSync(sqliteFile);
    for (const table of ["pdi_application_vault", "pdi_connection_cache", "pdi_identity_links", "pdi_session_vault"]) sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
    sqlite.close();
  }
  execSync("npx prisma db push --skip-generate", { cwd: apiRoot, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, stdio: "pipe" });
  prisma = new PrismaClient();
  await prisma.guestSession.deleteMany();
  await prisma.assertionExchange.deleteMany().catch(() => undefined);
  await prisma.customer.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();
  const org = await prisma.organization.create({ data: { name: "E2E Org", slug: "e2e-org", metadata: {} } });
  const tenant = await prisma.tenant.create({ data: { organizationId: org.id, name: "Sunrise Hotel", slug: "sunrise-hotel", status: "active", businessType: "hotel", operatingHours: [], settings: {} } });
  await prisma.branch.create({ data: { tenantId: tenant.id, name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC", status: "active" } });
  config.trustidApiUrl = stubBase;
  config.trustidJwksUrl = `${stubBase}/.well-known/jwks.json`;
  config.trustidIssuer = ISSUER;
  config.trustidAudience = "hospitalityos";
  process.env.DIGI_CORE_BASE_URL = digiBase;
  process.env.DDI_BASE_URL = ddiBase;
  process.env.SESSION_SECRET = "hospitality-pdi-session-secret";
  app = await buildApp();
});

after(async () => {
  elfcom?.kill("SIGTERM");
  await Promise.race([
    (async () => {
      await app?.close().catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
      for (const close of [...closers].reverse()) await close().catch(() => undefined);
      await pool?.end().catch(() => undefined);
    })(),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
});

async function login(subject: string) {
  const assertion = await issue(subject);
  const response = await app.inject({ method: "POST", url: "/auth/guest/trustid/exchange", payload: { assertion, tenantSlug: "sunrise-hotel" } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json() as { token: string; customer: { id: string; trustId: string } };
}

async function openPrePdiConversation(ownerTrustId: string, peerTrustId: string) {
  const secret = "elfcom-dev-node-secret-change-me";
  const sid = `proof:${ownerTrustId}`;
  const crypto = await import(pathToFileURL(path.join(ELFCOM_ROOT, "packages/elfcom-crypto/dist/index.js")).href) as { computeZkBind(key: Buffer, fields: { aud: string; sid: string; ownerTrustId: string }): string; derivePhaseASessionKey(secret: string, owner: string, sid: string): Buffer };
  const sessionKey = crypto.derivePhaseASessionKey(secret, ownerTrustId, sid);
  const zk_bind = crypto.computeZkBind(sessionKey, { aud: "elfcom", sid, ownerTrustId });
  const token = await new SignJWT({ sid, zk_bind, scp: ["thread:read", "thread:write", "message:send", "session:bind"] }).setProtectedHeader({ alg: "HS256" }).setIssuer("lifeos").setAudience("elfcom").setSubject(ownerTrustId).setExpirationTime("5m").sign(createSecretKey(Buffer.from(secret, "utf8")));
  const bound = await fetch(`http://127.0.0.1:${ELFCOM_PORT}/v1/session/bind`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ sid, ownerTrustId, zk_bind, sessionKeyBase64: sessionKey.toString("base64") }) });
  assert.equal(bound.status, 204, await bound.text());
  const opened = await fetch(`http://127.0.0.1:${ELFCOM_PORT}/v1/dm/open`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ peerTrustId }) });
  const openedBody = await opened.text();
  assert.equal(opened.status, 200, openedBody);
  return (JSON.parse(openedBody) as { thread: { id: string } }).thread.id;
}

test("real HospitalityOS PDI lifecycle against committed DDI and Digi", async () => {
  const preThreadId = await openPrePdiConversation(GUEST_A, GUEST_B);
  const first = await login(GUEST_A);
  assert.equal(first.customer.trustId, GUEST_A);
  const owner = sessions.at(-1);
  assert.ok(owner);
  assert.notEqual(first.customer.id, owner.ownerId);
  assert.notEqual(first.customer.trustId, owner.ownerId);
  const missing = await app.inject({ method: "GET", url: "/guest/pdi?diagnostics=1", headers: { authorization: `Bearer ${first.token}` } });
  assert.equal(missing.json().infrastructure, "NOT_PROVISIONED");
  assert.equal(missing.json().diagnostics.digiOwnerId, owner.ownerId);
  const created = await app.inject({ method: "POST", url: "/guest/pdi", headers: { authorization: `Bearer ${first.token}` } });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().infrastructure, "ACTIVE");
  assert.equal(created.json().connection, "NOT_CONNECTED");
  const requested = await app.inject({ method: "POST", url: "/guest/pdi/connect", headers: { authorization: `Bearer ${first.token}` } });
  assert.equal(requested.json().connection, "REQUESTED");
  const secret = registerBodies.at(-1)?.applicationCredential ?? "";
  assert.equal(secret.startsWith("ddiapp_"), true);
  assert.equal(requested.body.includes(secret), false);
  assert.equal(requested.body.includes(owner.sessionToken), false);
  const approved = await app.inject({ method: "POST", url: "/guest/pdi/approve", headers: { authorization: `Bearer ${first.token}` } });
  assert.equal(approved.statusCode, 200, approved.body);
  assert.equal(approved.json().connection, "ACTIVE");
  assert.equal(approveBodies.at(-1), JSON.stringify({ oneTime: false }));
  const grantId = connectionBodies.at(-1)?.authorityGrantRefs?.[0]?.grantId ?? "";
  assert.ok(grantId);
  const grant = await fetch(new URL(`/authority/grants/${grantId}`, digiBase), { headers: { authorization: `Bearer ${owner.sessionToken}` } });
  const grantBody = await grant.json() as { grant: { status: string; oneTime: boolean } };
  assert.equal(grant.status, 200);
  assert.equal(grantBody.grant.oneTime, false);
  assert.equal(grantBody.grant.status, "ACTIVE");
  const executed = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: { authorization: `Bearer ${first.token}` }, payload: { executionMode: "APP" } });
  console.log(`HOS_PDI_EXECUTE ${JSON.stringify({ status: executed.json().execution?.status, reason: executed.json().execution?.reason, ownerId: executed.json().execution?.ownerId })}`);
  assert.equal(executed.json().execution.status, "COMPLETED");
  assert.equal(executed.json().execution.ownerId, owner.ownerId);
  assert.equal(executed.json().execution.reason, undefined);
  const space = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: { authorization: `Bearer ${first.token}` }, payload: { executionMode: "SPACE" } });
  assert.equal(space.json().execution.status, "COMPLETED");
  assert.equal(space.json().execution.ownerId, owner.ownerId);
  const grantsBeforeReturn = await fetch(new URL("/authority/grants/active", digiBase), { headers: { authorization: `Bearer ${owner.sessionToken}` } });
  const activeBefore = ((await grantsBeforeReturn.json()) as { grants: Array<{ id: string; oneTime: boolean }> }).grants.filter((item) => item.oneTime === false);
  const returning = await login(GUEST_A);
  const same = sessions.at(-1);
  assert.equal(same?.ownerId, owner.ownerId);
  const surface = await app.inject({ method: "GET", url: "/guest/pdi?diagnostics=1", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(surface.json().connection, "ACTIVE");
  assert.equal(surface.json().diagnostics.digiOwnerId, owner.ownerId);
  const repeat = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: { authorization: `Bearer ${returning.token}` }, payload: { executionMode: "APP" } });
  assert.equal(repeat.json().execution.status, "COMPLETED");
  assert.equal(repeat.json().execution.ownerId, owner.ownerId);
  const grantsAfterReturn = await fetch(new URL("/authority/grants/active", digiBase), { headers: { authorization: `Bearer ${same!.sessionToken}` } });
  const activeAfter = ((await grantsAfterReturn.json()) as { grants: Array<{ id: string }> }).grants;
  assert.equal(activeAfter.length, activeBefore.length);
  const other = await login(GUEST_B);
  const otherOwner = sessions.at(-1);
  assert.notEqual(otherOwner?.ownerId, owner.ownerId);
  const otherSurface = await app.inject({ method: "GET", url: "/guest/pdi", headers: { authorization: `Bearer ${other.token}` } });
  assert.equal(otherSurface.json().infrastructure, "NOT_PROVISIONED");
  const stolen = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: { authorization: `Bearer ${other.token}` } });
  assert.notEqual(stolen.json().execution?.status, "COMPLETED");
  const revoked = await app.inject({ method: "POST", url: "/guest/pdi/revoke", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(revoked.json().connection, "REVOKED");
  const revokedGrant = await fetch(new URL(`/authority/grants/${grantId}`, digiBase), { headers: { authorization: `Bearer ${same!.sessionToken}` } });
  assert.equal(((await revokedGrant.json()) as { grant: { status: string } }).grant.status, "REVOKED");
  const still = await app.inject({ method: "GET", url: "/auth/guest/me", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(still.statusCode, 200);
  const denied = await app.inject({ method: "POST", url: "/guest/pdi/execute", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(denied.json().execution.status, "DENIED");
  assert.equal(denied.json().execution.reason, "CONNECTION_NOT_ACTIVE");
  const reconnect = await app.inject({ method: "POST", url: "/guest/pdi/connect", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(reconnect.json().connection, "REQUESTED");
  const reapproved = await app.inject({ method: "POST", url: "/guest/pdi/approve", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(reapproved.json().connection, "ACTIVE");
  assert.equal(approveBodies.at(-1), JSON.stringify({ oneTime: false }));
  const newGrant = connectionBodies.at(-1)?.authorityGrantRefs?.[0]?.grantId ?? "";
  assert.notEqual(newGrant, grantId);
  const oldStill = await fetch(new URL(`/authority/grants/${grantId}`, digiBase), { headers: { authorization: `Bearer ${same!.sessionToken}` } });
  assert.equal(((await oldStill.json()) as { grant: { status: string } }).grant.status, "REVOKED");
  const restored = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(restored.json().execution.status, "COMPLETED");
  assert.equal(restored.json().execution.ownerId, owner.ownerId);
  const publicBody = restored.body;
  assert.equal(publicBody.includes(secret), false);
  assert.equal(publicBody.includes(owner.sessionToken), false);
  assert.equal(publicBody.includes(owner.assertion), false);
  const blocked = await app.inject({ method: "POST", url: "/guest/pdi/communication/execute", headers: { authorization: `Bearer ${returning.token}` }, payload: { executionMode: "APP" } });
  assert.equal(blocked.json().execution.status, "DENIED");
  assert.equal(blocked.json().execution.reason, "CAPABILITY_NOT_APPROVED");
  const requestedCommunication = await app.inject({ method: "POST", url: "/guest/pdi/communication/request", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(requestedCommunication.statusCode, 200, requestedCommunication.body);
  const approvedCommunication = await app.inject({ method: "POST", url: "/guest/pdi/communication/approve", headers: { authorization: `Bearer ${returning.token}` } });
  assert.equal(approvedCommunication.statusCode, 200, approvedCommunication.body);
  assert.equal(approveBodies.at(-1), JSON.stringify({ oneTime: false }));
  const inbox = await app.inject({ method: "POST", url: "/guest/pdi/communication/execute", headers: { authorization: `Bearer ${returning.token}` }, payload: { executionMode: "APP" } });
  assert.equal(inbox.json().execution.status, "COMPLETED", inbox.body);
  assert.equal(inbox.json().execution.provider, "ElfCom");
  assert.equal(inbox.json().execution.ownerId, owner.ownerId);
  assert.equal(inbox.json().execution.accountRef, undefined);
  assert.equal((inbox.json().execution.threads as Array<{ id: string }>).some((thread) => thread.id === preThreadId), true);
  assert.equal(inbox.body.includes(`elfcom:${owner.ownerId}`), false);
  assert.equal(inbox.body.includes("SYSTEM_MANAGED"), false);
  assert.equal(inbox.body.includes("ownerTrustId"), false);
  const inboxSpace = await app.inject({ method: "POST", url: "/guest/pdi/communication/execute", headers: { authorization: `Bearer ${returning.token}` }, payload: { executionMode: "SPACE" } });
  assert.equal(inboxSpace.json().execution.status, "COMPLETED");
  assert.equal(inboxSpace.json().execution.ownerId, owner.ownerId);
  assert.equal((inboxSpace.json().execution.threads as Array<{ id: string }>).some((thread) => thread.id === preThreadId), true);
  const identityAgain = await app.inject({ method: "POST", url: "/guest/pdi/execute?diagnostics=1", headers: { authorization: `Bearer ${returning.token}` }, payload: { executionMode: "APP" } });
  assert.equal(identityAgain.json().execution.status, "COMPLETED");
  assert.equal(identityAgain.json().execution.ownerId, inbox.json().execution.ownerId);
  const counted = await pool.query<{ namespace: string; n: string }>(`SELECT namespace, count(*)::text AS n FROM ddi_primitive_bindings GROUP BY namespace ORDER BY namespace`);
  assert.deepEqual(counted.rows.map((row) => [row.namespace, Number(row.n)]), [["communication", 1], ["identity", 1]]);
  const mailbox = await pool.query<{ id: string; provider_reference: string }>(`SELECT id, provider_reference FROM ddi_primitive_bindings WHERE namespace = 'communication'`);
  assert.equal(mailbox.rows.length, 1);
  assert.equal(mailbox.rows[0]?.provider_reference.includes(encodeURIComponent(GUEST_A)), true);
  assert.equal(mailbox.rows[0]?.provider_reference.includes(`digiOwner:${owner.ownerId}`), true);
  assert.equal(mailbox.rows[0]?.provider_reference.includes("elfcom:"), false);
  assert.equal(inbox.body.includes(ELFCOM_TOKEN), false);
  assert.equal(inbox.body.includes(owner.sessionToken), false);
  assert.equal(inbox.body.includes(owner.assertion), false);
  const returnedAgain = await login(GUEST_A);
  assert.equal(sessions.at(-1)?.ownerId, owner.ownerId);
  const inboxAgain = await app.inject({ method: "POST", url: "/guest/pdi/communication/execute", headers: { authorization: `Bearer ${returnedAgain.token}` }, payload: { executionMode: "APP" } });
  assert.equal(inboxAgain.json().execution.status, "COMPLETED", inboxAgain.body);
  assert.equal((inboxAgain.json().execution.threads as Array<{ id: string }>).some((thread) => thread.id === preThreadId), true);
  const afterReturn = await pool.query<{ id: string; n: string }>(`SELECT id, count(*)::text AS n FROM ddi_primitive_bindings WHERE namespace = 'communication' GROUP BY id`);
  assert.equal(afterReturn.rows.length, 1);
  assert.equal(afterReturn.rows[0]?.id, mailbox.rows[0]?.id);
  console.log(`HOS_PDI_COMMUNICATION ${JSON.stringify({ ownerId: inbox.json().execution.ownerId, provider: inbox.json().execution.provider, preThreadId, threads: inbox.json().execution.threads?.length, sameMailbox: afterReturn.rows[0]?.id === mailbox.rows[0]?.id })}`);
});
