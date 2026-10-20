/**
 * Deployment configuration and startup checks that need no database.
 * PostgreSQL behaviour (concurrent migrate deploy, refusing to start on pending or failed
 * migrations) is covered by test/postgres/deploy-migrations.pg.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeConfig, type AppEnv } from "../src/lib/env-validate.js";
import { evaluateMigrations, expectedMigrations, type MigrationRow } from "../src/lib/migration-status.js";
import { runStartupPreflight, StartupPreflightError } from "../src/startup/preflight.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const rootScripts = readJson(path.join(repoRoot, "package.json")).scripts as Record<string, string>;
const apiScripts = readJson(path.join(apiRoot, "package.json")).scripts as Record<string, string>;
const railway = readJson(path.join(repoRoot, "railway.json"));

/** Expand root and API `npm run x` references into the commands they run (other workspaces stay as-is). */
function expand(command: string, depth = 0): string {
  assert.ok(depth < 6, "script expansion too deep");
  return command.replace(/npm run ([\w:-]+)(?: -w (@[\w./-]+))?/g, (whole, name: string, workspace?: string) => {
    if (workspace && workspace !== "@hospitalityos/api") return whole;
    const body = (workspace ? apiScripts : rootScripts)[name];
    return body === undefined ? whole : `(${expand(body, depth + 1)})`;
  });
}

test("Railway deploy path: PostgreSQL client build, migrations before start, readiness healthcheck", () => {
  assert.equal(railway.build.buildCommand, "npm run build:api:pg");
  assert.equal(railway.deploy.preDeployCommand, "npm run db:migrate:deploy");
  assert.equal(railway.deploy.startCommand, "npm run start:api");
  assert.equal(railway.deploy.healthcheckPath, "/ready");

  const build = expand(railway.build.buildCommand);
  assert.match(build, /pg-generate\.mjs/, "build generates the PostgreSQL Prisma client");
  assert.doesNotMatch(build, /\(prisma generate\)/, "build does not generate the SQLite client");

  const preDeploy = expand(railway.deploy.preDeployCommand);
  assert.match(preDeploy, /pg-migrate\.mjs --deploy/);

  const start = expand(railway.deploy.startCommand);
  assert.equal(start, "((node dist/index.js))");
  for (const [label, cmd] of [["build", build], ["pre-deploy", preDeploy], ["start", start]] as const) {
    assert.doesNotMatch(cmd, /db push|db:push|migrate reset|--force-reset|--accept-data-loss/, `${label} must not push or reset`);
  }
});

test("pg-push refuses deployed environments; pg-migrate refuses SQLite, --create when deployed, and disabled locking", () => {
  const run = (script: string, args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [path.join(apiRoot, "scripts", script), ...args], {
      cwd: apiRoot,
      env: { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "", ...env },
      encoding: "utf8",
    });
  // Port 1 on loopback: nothing listens, so a refusal must happen before any connection.
  const pgUrl = "postgresql://nobody:nothing@127.0.0.1:1/none";
  for (const hosEnv of ["staging", "production"]) {
    const r = run("pg-push.mjs", [], { HOS_ENV: hosEnv, DATABASE_URL: pgUrl });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /Refusing to push a schema/);
  }
  const sqlite = run("pg-migrate.mjs", ["--deploy"], { DATABASE_URL: "file:./never.db" });
  assert.equal(sqlite.status, 1);
  assert.match(sqlite.stderr, /postgres:\/\/ URL/);
  const create = run("pg-migrate.mjs", ["--create", "--name=x"], { HOS_ENV: "staging", DATABASE_URL: pgUrl });
  assert.equal(create.status, 1);
  assert.match(create.stderr, /Refusing --create in staging/);
  const unlocked = run("pg-migrate.mjs", ["--deploy"], { DATABASE_URL: pgUrl, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" });
  assert.equal(unlocked.status, 1);
  assert.match(unlocked.stderr, /ADVISORY_LOCK/);
});

const strong = (c: string) => c.repeat(40);
function stagingConfig(overrides: Partial<Parameters<typeof validateRuntimeConfig>[0]> = {}) {
  return validateRuntimeConfig({
    env: "staging",
    databaseUrl: "postgresql://hos:synthetic@db.internal:5432/hos",
    sessionSecret: strong("s"),
    webhookSecret: strong("w"),
    allowDemoGuest: true,
    emailProvider: "mock",
    mediaSigningSecret: strong("m"),
    mediaRoot: "./media-private",
    internalProvisionToken: strong("i"),
    primitivesServiceToken: strong("p"),
    primitivesMode: "local",
    stagingAccessToken: strong("a"),
    ...overrides,
  });
}

test("staging profile: PostgreSQL and strong secrets like production, isolated from live services, access-gated", () => {
  assert.deepEqual(stagingConfig().errors, []);
  const expectError = (overrides: Parameters<typeof stagingConfig>[0], needle: string) => {
    const r = stagingConfig(overrides);
    assert.ok(r.errors.some((e) => e.includes(needle)), `${needle}: ${JSON.stringify(r.errors)}`);
  };
  expectError({ databaseUrl: "file:./staging.db" }, "PostgreSQL");
  expectError({ databaseUrl: "" }, "PostgreSQL");
  expectError({ sessionSecret: "dev-only-session-secret-change-me" }, "SESSION_SECRET");
  expectError({ internalProvisionToken: "dev-primitives-token" }, "INTERNAL_PROVISION_TOKEN");
  expectError({ mediaSigningSecret: "short" }, "MEDIA_SIGNING_SECRET");
  expectError({ primitivesMode: "remote" }, "PRIMITIVES_MODE=local");
  expectError({ emailProvider: "smtp" }, "EMAIL_PROVIDER");
  expectError({ ddiBaseUrl: "https://ddi.example" }, "DDI_BASE_URL");
  expectError({ digiCoreBaseUrl: "https://digi.example" }, "DIGI_CORE_BASE_URL");
  expectError({ stagingAccessToken: "" }, "HOS_STAGING_ACCESS_TOKEN");
  expectError({ stagingAccessToken: "too-short" }, "HOS_STAGING_ACCESS_TOKEN");
});

test("production keeps its rules and may not carry a staging access token", () => {
  const prod = (overrides: Partial<Parameters<typeof validateRuntimeConfig>[0]> = {}) =>
    validateRuntimeConfig({
      env: "production" as AppEnv,
      databaseUrl: "postgresql://hos:x@db:5432/hos",
      sessionSecret: strong("s"),
      webhookSecret: strong("w"),
      allowDemoGuest: false,
      emailProvider: "smtp",
      smtpUrl: "smtp://mail.example",
      smtpFrom: "stays@hotel.example",
      mediaSigningSecret: strong("m"),
      mediaRoot: "/data/media",
      digiCoreBaseUrl: "https://digi.example",
      ddiBaseUrl: "https://ddi.example",
      internalProvisionToken: strong("i"),
      primitivesServiceToken: strong("p"),
      primitivesMode: "remote",
      ...overrides,
    });
  assert.deepEqual(prod().errors, []);
  assert.ok(prod({ stagingAccessToken: strong("a") }).errors.some((e) => e.includes("HOS_STAGING_ACCESS_TOKEN")));
  assert.ok(prod({ databaseUrl: "file:./prod.db" }).errors.some((e) => e.includes("PostgreSQL")));
  assert.ok(prod({ primitivesMode: "local" }).errors.some((e) => e.includes("PRIMITIVES_MODE=remote")));
  assert.ok(prod({ allowDemoGuest: true }).errors.some((e) => e.includes("ALLOW_DEMO_GUEST")));
});

test("migration state: ok only when every shipped migration finished", () => {
  const shipped = expectedMigrations();
  assert.ok(shipped.length >= 4, `shipped migrations: ${shipped.join(", ")}`);
  assert.ok(shipped.includes("20261019000100_reservation_room_night_ledger"));
  const done = (name: string): MigrationRow => ({ migration_name: name, finished_at: new Date(), rolled_back_at: null });

  assert.equal(evaluateMigrations(shipped, null).state, "not_migrated");
  assert.equal(evaluateMigrations(shipped, []).state, "not_migrated");
  assert.equal(evaluateMigrations(shipped, shipped.map(done)).state, "ok");

  const pending = evaluateMigrations(shipped, shipped.slice(0, -1).map(done));
  assert.equal(pending.state, "pending");
  assert.deepEqual(pending.pending, [shipped[shipped.length - 1]]);

  const failedRow: MigrationRow = { migration_name: shipped[shipped.length - 1], finished_at: null, rolled_back_at: null };
  assert.equal(evaluateMigrations(shipped, [...shipped.slice(0, -1).map(done), failedRow]).state, "failed");

  // A failed attempt that was resolved as rolled back and then re-applied is fine.
  const rolledBack: MigrationRow = { ...failedRow, rolled_back_at: new Date() };
  assert.equal(evaluateMigrations(shipped, [...shipped.map(done), rolledBack]).state, "ok");

  const ahead = evaluateMigrations(shipped, [...shipped.map(done), done("29990101000000_future")]);
  assert.equal(ahead.state, "unknown_applied");
});

test("startup preflight: skipped in development and test, refuses SQLite in staging and production", async () => {
  assert.equal(await runStartupPreflight({ env: "test", databaseUrl: "file:./test.db" }), null);
  assert.equal(await runStartupPreflight({ env: "development", databaseUrl: "file:./dev.db" }), null);
  for (const env of ["staging", "production"] as const) {
    await assert.rejects(
      runStartupPreflight({ env, databaseUrl: "file:./test.db" }),
      (err: unknown) => err instanceof StartupPreflightError && /requires a PostgreSQL DATABASE_URL/.test(err.message),
    );
  }
});
