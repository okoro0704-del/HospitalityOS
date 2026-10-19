#!/usr/bin/env node
/**
 * Run the reservation integrity suite against a disposable PostgreSQL database, so the
 * room-night unique index and transactions are exercised by PostgreSQL itself.
 *
 * Usage:
 *   HOS_INTEGRITY_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/empty_db node scripts/pg-integrity.mjs
 *
 * Safety: the database must be on this machine (set HOS_INTEGRITY_ALLOW_REMOTE=1 for a
 * disposable CI service elsewhere) and must be empty — the script applies the migrations
 * with `prisma migrate deploy` and never resets or drops anything. Afterwards the default
 * (SQLite) Prisma client is regenerated so local development is unaffected.
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const schemaSrc = path.join(apiRoot, "prisma", "schema.prisma");
const schemaOut = path.join(apiRoot, "prisma", "schema.postgres.generated.prisma");

const url = process.env.HOS_INTEGRITY_DATABASE_URL ?? "";
if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
  console.error("Set HOS_INTEGRITY_DATABASE_URL to a postgres:// URL of an empty, disposable database.");
  process.exit(2);
}
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) && process.env.HOS_INTEGRITY_ALLOW_REMOTE !== "1") {
  console.error(`Refusing non-local database host ${host} (set HOS_INTEGRITY_ALLOW_REMOTE=1 for a disposable CI service).`);
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
);
await client.end();
if (rows[0].n > 0) {
  console.error(`Refusing: the database already has ${rows[0].n} table(s). Use an empty, disposable database.`);
  process.exit(2);
}

fs.writeFileSync(
  schemaOut,
  fs.readFileSync(schemaSrc, "utf8").replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"'),
);
const env = { ...process.env, DATABASE_URL: url };
const run = (cmd) => execSync(cmd, { cwd: apiRoot, env, stdio: "inherit" });

let status = 1;
try {
  run(`npx prisma migrate deploy --schema "${schemaOut}"`);
  run(`npx prisma generate --schema "${schemaOut}"`);
  const test = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "test/reservation-integrity.test.ts"],
    { cwd: apiRoot, env: { ...env, NODE_ENV: "test", HOS_INTEGRITY_DATABASE_URL: url }, stdio: "inherit" },
  );
  status = test.status ?? 1;
} finally {
  run("npx prisma generate");
}
process.exit(status);
