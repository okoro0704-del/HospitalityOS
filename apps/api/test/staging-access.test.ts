/**
 * Staging access gate: a staging API answers only liveness and readiness anonymously.
 * The staging production-safety assert is skipped here only so the gate can be exercised on the
 * SQLite test database; test/deploy-config.test.ts covers the validation itself.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

const ACCESS = "staging-access-token-for-tests-0123456789abcdef";
process.env.HOS_ENV = "staging";
process.env.HOS_SKIP_PRODUCTION_ASSERT = "true";
process.env.HOS_STAGING_ACCESS_TOKEN = ACCESS;

let app: FastifyInstance;

before(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("liveness and readiness stay open; readiness is not ready on a non-PostgreSQL database", async () => {
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  const ready = await app.inject({ method: "GET", url: "/ready?probe=1" });
  assert.equal(ready.statusCode, 503, ready.body);
  assert.equal(ready.json().checks.migrations, "skipped");
});

test("everything else needs the access token", async () => {
  const anonymous = await app.inject({ method: "GET", url: "/modules/catalog" });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().error, "staging_access_required");

  const wrong = await app.inject({ method: "GET", url: "/modules/catalog", headers: { "x-hos-access": `${ACCESS}x` } });
  assert.equal(wrong.statusCode, 401);

  const allowed = await app.inject({ method: "GET", url: "/modules/catalog", headers: { "x-hos-access": ACCESS } });
  assert.equal(allowed.statusCode, 200, allowed.body);
});

test("tenant provisioning is unreachable without the access token, even with a provisioning bearer", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/internal/distributor/provision",
    headers: { authorization: "Bearer dev-primitives-token" },
    payload: { subdomain: "never", displayName: "Never", distributorTenantId: "tid_never" },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "staging_access_required");
});

test("health paths are matched exactly, not by prefix", async () => {
  const res = await app.inject({ method: "GET", url: "/health/../modules/catalog" });
  assert.notEqual(res.statusCode, 200);
  const post = await app.inject({ method: "POST", url: "/health" });
  assert.equal(post.statusCode, 401);
});
