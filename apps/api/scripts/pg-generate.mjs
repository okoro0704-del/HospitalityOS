#!/usr/bin/env node
/**
 * Generate the Prisma client for PostgreSQL (deployed builds). Needs no database connection.
 *   node scripts/pg-generate.mjs
 */
import { execSync } from "node:child_process";
import { apiRoot, writePostgresSchema } from "./lib/pg-schema.mjs";

const schema = writePostgresSchema();
execSync(`npx prisma generate --schema "${schema}"`, { cwd: apiRoot, stdio: "inherit" });
console.log("Generated the PostgreSQL Prisma client.");
