/**
 * PostgreSQL deployment path, end to end against a real server:
 *   - concurrent `db:migrate:deploy` runs serialize and apply each migration exactly once;
 *   - re-running after success is a no-op (restart / recovery);
 *   - a failed migration makes the next deploy fail instead of continuing;
 *   - the API refuses to start on a database that is not migrated, has pending migrations,
 *     or has a failed migration, and serves (with the staging access gate) when it is current.
 *
 * Needs the PostgreSQL Prisma client (`npm run db:generate:pg -w @hospitalityos/api`) and
 *   HOS_PG_ADMIN_URL=postgresql://user:pass@127.0.0.1:5432
 * pointing at a disposable server where the user may create databases. Every database this
 * test creates is named hos_deploy_<run>_* and dropped afterwards. Not part of the SQLite suite.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { expectedMigrations } from "../../src/lib/migration-status.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..", "..");
const adminBase = (process.env.HOS_PG_ADMIN_URL ?? "").replace(/\/+$/, "");
const host = adminBase ? new URL(adminBase).hostname : "";
if (!/^(postgres|postgresql):\/\//.test(adminBase)) throw new Error("Set HOS_PG_ADMIN_URL to a disposable PostgreSQL server");
if (!["127.0.0.1", "localhost", "::1"].includes(host) && process.env.HOS_PG_ALLOW_REMOTE !== "1") {
  throw new Error(`Refusing non-local PostgreSQL host ${host}`);
}

const run = randomBytes(3).toString("hex");
const dbUrl = (name: string) => `${adminBase}/${name}`;
const created: string[] = [];
const shipped = expectedMigrations();

async function admin<T = unknown>(sql: string, db = "postgres"): Promise<T[]> {
  const client = new pg.Client({ connectionString: dbUrl(db) });
  await client.connect();
  try {
    return (await client.query(sql)).rows as T[];
  } finally {
    await client.end();
  }
}

async function createDb(suffix: string) {
  const name = `hos_deploy_${run}_${suffix}`;
  await admin(`CREATE DATABASE ${name}`);
  created.push(name);
  return name;
}

type Exit = { code: number | null; out: string };

function node(args: string[], env: Record<string, string>, timeoutMs = 180_000): Promise<Exit> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: apiRoot, env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const migrate = (db: string) => node(["scripts/pg-migrate.mjs", "--deploy"], { DATABASE_URL: dbUrl(db), DIRECT_DATABASE_URL: "" });

const strong = (c: string) => c.repeat(40);
const ACCESS = strong("a");
function stagingEnv(db: string, port: number) {
  return {
    HOS_ENV: "staging",
    NODE_ENV: "production",
    DATABASE_URL: dbUrl(db),
    HOS_HOST: "127.0.0.1",
    HOS_PORT: String(port),
    SESSION_SECRET: strong("s"),
    WEBHOOK_SECRET: strong("w"),
    MEDIA_SIGNING_SECRET: strong("m"),
    INTERNAL_PROVISION_TOKEN: strong("i"),
    PRIMITIVES_SERVICE_TOKEN: strong("p"),
    PRIMITIVES_MODE: "local",
    EMAIL_PROVIDER: "mock",
    HOS_STAGING_ACCESS_TOKEN: ACCESS,
    DIGI_CORE_BASE_URL: "",
    DDI_BASE_URL: "",
    HOS_SKIP_PRODUCTION_ASSERT: "",
  };
}

/** Start the real entry point; resolve once it listens, or with its exit if it refuses. */
function startApi(db: string, port: number): Promise<{ listening: boolean; exit?: Exit; stop: () => void; out: () => string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: apiRoot,
      env: { ...process.env, ...stagingEnv(db, port) },
    });
    let out = "";
    let settled = false;
    const stop = () => child.kill();
    const onData = (d: Buffer) => {
      out += d;
      if (!settled && out.includes("API listening on")) {
        settled = true;
        resolve({ listening: true, stop, out: () => out });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ listening: false, exit: { code: null, out }, stop, out: () => out });
      }
    }, 120_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({ listening: false, exit: { code, out }, stop, out: () => out });
      }
    });
  });
}

const port = () => 20_000 + Math.floor(Math.random() * 20_000);

before(async () => {
  await admin("SELECT 1");
});

after(async () => {
  for (const name of created) {
    await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
  }
});

test("concurrent deploys serialize, apply every migration exactly once, and a re-run is a no-op", { timeout: 600_000 }, async () => {
  const db = await createDb("concurrent");
  const runs = await Promise.all([migrate(db), migrate(db), migrate(db)]);
  for (const r of runs) assert.equal(r.code, 0, r.out);

  const rows = await admin<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`,
    db,
  );
  assert.deepEqual(rows.map((r) => r.migration_name), shipped, "each shipped migration recorded exactly once");
  assert.ok(rows.every((r) => r.finished_at !== null && r.rolled_back_at === null), "all finished");

  const again = await migrate(db);
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /No pending migrations to apply|already in sync/i);
  const after = await admin<{ n: string }>(`SELECT count(*)::text AS n FROM _prisma_migrations`, db);
  assert.equal(Number(after[0].n), shipped.length, "re-running adds nothing");
});

test("the API serves only on a fully migrated database, behind the staging access gate", { timeout: 600_000 }, async () => {
  const db = await createDb("serving");
  const m = await migrate(db);
  assert.equal(m.code, 0, m.out);

  const p = port();
  const api = await startApi(db, p);
  assert.ok(api.listening, api.exit?.out);
  try {
    assert.match(api.out(), /migrations verified \(state=ok applied=(\d+)\/\1\)/);
    const base = `http://127.0.0.1:${p}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const ready = await fetch(`${base}/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual((await ready.json()).checks, { database: "ok", migrations: "ok" });
    const anonymous = await fetch(`${base}/modules/catalog`);
    assert.equal(anonymous.status, 401);
    const allowed = await fetch(`${base}/modules/catalog`, { headers: { "x-hos-access": ACCESS } });
    assert.equal(allowed.status, 200);
  } finally {
    api.stop();
  }
});

test("the API refuses to start on an unmigrated database", { timeout: 300_000 }, async () => {
  const db = await createDb("empty");
  const api = await startApi(db, port());
  assert.equal(api.listening, false, "must not listen");
  assert.notEqual(api.exit?.code, 0);
  assert.match(api.exit?.out ?? "", /refused to start: Database migrations are not complete \(state=not_migrated/);
});

test("pending migrations: the API refuses to start", { timeout: 300_000 }, async () => {
  const db = await createDb("pending");
  assert.equal((await migrate(db)).code, 0);
  const last = shipped[shipped.length - 1];
  await admin(`DELETE FROM _prisma_migrations WHERE migration_name = '${last}'`, db);
  const api = await startApi(db, port());
  assert.equal(api.listening, false, "must not listen");
  assert.match(api.exit?.out ?? "", new RegExp(`state=pending .*pending=${last}`));
});

test("a failed migration stops the next deploy and the API refuses to start", { timeout: 300_000 }, async () => {
  const db = await createDb("failed");
  assert.equal((await migrate(db)).code, 0);
  const last = shipped[shipped.length - 1];
  // Record the last migration as started but never finished, as Prisma does when one fails midway.
  await admin(
    `UPDATE _prisma_migrations SET finished_at = NULL, logs = 'simulated failure' WHERE migration_name = '${last}'`,
    db,
  );

  const redeploy = await migrate(db);
  assert.equal(redeploy.code, 1, redeploy.out);
  assert.match(redeploy.out, /FAILED: migrations were not applied/);

  const api = await startApi(db, port());
  assert.equal(api.listening, false, "must not listen");
  assert.match(api.exit?.out ?? "", new RegExp(`state=failed .*failed=${last}`));
});
