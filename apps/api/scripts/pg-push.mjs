#!/usr/bin/env node
/**
 * Push Prisma schema to PostgreSQL without changing the checked-in SQLite provider.
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/pg-push.mjs
 *   node scripts/pg-push.mjs --seed
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const schemaSrc = path.join(apiRoot, "prisma", "schema.prisma");
const schemaOut = path.join(apiRoot, "prisma", "schema.postgres.generated.prisma");

const hosEnv = (process.env.HOS_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
if (["production", "prod", "staging", "stage"].includes(hosEnv)) {
  // db push rewrites a schema without migration history and can drop data. Deployed
  // databases change only through versioned migrations: npm run db:migrate:deploy.
  console.error(`Refusing to push a schema in ${hosEnv}. Use versioned migrations (db:migrate:deploy).`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL ?? "";
if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
  console.error("pg-push requires DATABASE_URL (or DIRECT_DATABASE_URL) to be a postgres:// URL");
  process.exit(1);
}

const direct = process.env.DIRECT_DATABASE_URL || url;
let schema = fs.readFileSync(schemaSrc, "utf8");
schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
fs.writeFileSync(schemaOut, schema);

const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_DATABASE_URL: direct,
};

console.log("Pushing schema to PostgreSQL…");
execSync(`npx prisma db push --schema "${schemaOut}" --skip-generate`, {
  cwd: apiRoot,
  env,
  stdio: "inherit",
});

if (process.argv.includes("--generate")) {
  execSync(`npx prisma generate --schema "${schemaOut}"`, {
    cwd: apiRoot,
    env,
    stdio: "inherit",
  });
}

if (process.argv.includes("--seed")) {
  if ((process.env.HOS_ENV ?? process.env.NODE_ENV) === "production" && process.env.HOS_ALLOW_PRODUCTION_SEED !== "true") {
    console.error("Refusing to seed production without HOS_ALLOW_PRODUCTION_SEED=true");
    process.exit(1);
  }
  execSync("npx tsx prisma/seed.ts", { cwd: apiRoot, env, stdio: "inherit" });
}

console.log("PostgreSQL push complete.");
