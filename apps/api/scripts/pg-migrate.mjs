#!/usr/bin/env node
/**
 * Versioned PostgreSQL migrations (Prisma Migrate). Never uses SQLite and never pushes a schema.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... [DIRECT_DATABASE_URL=postgresql://...] node scripts/pg-migrate.mjs --deploy
 *   node scripts/pg-migrate.mjs --status
 *   node scripts/pg-migrate.mjs --create --name=<name>   # development only: writes a new migration
 *
 * --deploy is the pre-deploy step: it runs once per deployment, before any instance starts.
 * Prisma Migrate holds a PostgreSQL advisory lock while it applies migrations, so concurrent
 * deploys serialize instead of racing; a waiter that times out on the lock retries here.
 * The deploy succeeds only if `migrate status` then reports the database up to date. Any
 * failure exits non-zero, which fails the deployment and keeps the previous release serving.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { apiRoot, deployedEnv, isPostgresUrl, writePostgresSchema } from "./lib/pg-schema.mjs";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "";
if (!isPostgresUrl(url)) {
  console.error("pg-migrate requires DATABASE_URL / DIRECT_DATABASE_URL to be a postgres:// URL");
  process.exit(1);
}

const create = process.argv.includes("--create");
const status = process.argv.includes("--status");
const deploy = process.argv.includes("--deploy") || (!create && !status);
const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url };

if (create && deployedEnv()) {
  // `migrate dev` can offer to reset a drifted database; it never runs against a deployed one.
  console.error(`Refusing --create in ${deployedEnv()}: write migrations in development and ship them.`);
  process.exit(1);
}
if (deploy && process.env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK) {
  console.error("Refusing to deploy migrations with PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK set: concurrent deploys would race.");
  process.exit(1);
}

const schema = writePostgresSchema();
fs.mkdirSync(path.join(apiRoot, "prisma", "migrations"), { recursive: true });

function prisma(args, { echo = true } = {}) {
  const r = spawnSync("npx", ["prisma", ...args, "--schema", schema], {
    cwd: apiRoot,
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (echo) process.stdout.write(output);
  return { code: r.status ?? 1, output };
}

if (status) {
  process.exit(prisma(["migrate", "status"]).code);
}

if (create) {
  const name = process.argv.find((a) => a.startsWith("--name="))?.slice(7) || "migration";
  const r = prisma(["migrate", "dev", "--name", name, "--create-only"]);
  if (r.code === 0) console.log("Migration SQL created under prisma/migrations — review it before shipping.");
  process.exit(r.code);
}

if (deploy) {
  const attempts = Number(process.env.HOS_MIGRATE_LOCK_ATTEMPTS ?? 6);
  for (let attempt = 1; ; attempt++) {
    console.log(`[migrate] prisma migrate deploy (attempt ${attempt}/${attempts})`);
    const r = prisma(["migrate", "deploy"]);
    if (r.code === 0) break;
    const lockTimeout = /advisory lock|P1002/i.test(r.output);
    if (!lockTimeout || attempt >= attempts) {
      console.error("[migrate] FAILED: migrations were not applied; the deployment must not start.");
      process.exit(1);
    }
    console.log("[migrate] another deploy holds the migration lock; waiting before retrying");
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
  }
  const verified = prisma(["migrate", "status"]);
  if (verified.code !== 0) {
    console.error("[migrate] FAILED: the database is not up to date after migrate deploy.");
    process.exit(1);
  }
  console.log("[migrate] database schema is up to date.");
}
