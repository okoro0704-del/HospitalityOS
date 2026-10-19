#!/usr/bin/env node
/**
 * Production migration path (Prisma Migrate) against PostgreSQL.
 * Does NOT use sqlite. Does NOT use db push for the final production process.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... DIRECT_DATABASE_URL=postgresql://... node scripts/pg-migrate.mjs
 *   node scripts/pg-migrate.mjs --create   # create initial migration from schema (dev/staging)
 *   node scripts/pg-migrate.mjs --deploy   # prisma migrate deploy (production)
 *   node scripts/pg-migrate.mjs --status
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const schemaSrc = path.join(apiRoot, "prisma", "schema.prisma");
const schemaOut = path.join(apiRoot, "prisma", "schema.postgres.generated.prisma");
const migrationsDir = path.join(apiRoot, "prisma", "migrations");

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "";
if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
  console.error("pg-migrate requires DATABASE_URL / DIRECT_DATABASE_URL to be postgres://");
  process.exit(1);
}

let schema = fs.readFileSync(schemaSrc, "utf8");
schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
fs.writeFileSync(schemaOut, schema);
fs.mkdirSync(migrationsDir, { recursive: true });

const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL || url,
};

const create = process.argv.includes("--create");
const deploy = process.argv.includes("--deploy") || (!create && !process.argv.includes("--status"));
const status = process.argv.includes("--status");

if (status) {
  execSync(`npx prisma migrate status --schema "${schemaOut}"`, { cwd: apiRoot, env, stdio: "inherit" });
  process.exit(0);
}

if (create) {
  const name = process.argv.find((a) => a.startsWith("--name="))?.slice(7) || "init_postgres";
  console.log(`Creating migration: ${name}`);
  execSync(`npx prisma migrate dev --schema "${schemaOut}" --name ${name} --create-only`, {
    cwd: apiRoot,
    env,
    stdio: "inherit",
  });
  console.log("Migration SQL created under prisma/migrations — review before deploy.");
  process.exit(0);
}

if (deploy) {
  console.log("Deploying migrations to PostgreSQL…");
  execSync(`npx prisma migrate deploy --schema "${schemaOut}"`, {
    cwd: apiRoot,
    env,
    stdio: "inherit",
  });
  console.log("migrate deploy complete.");
}
