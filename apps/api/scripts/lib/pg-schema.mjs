/**
 * The checked-in schema uses the SQLite provider for local development. Deployed builds and
 * migrations use the same models with the PostgreSQL provider, written to a generated file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const schemaSrc = path.join(apiRoot, "prisma", "schema.prisma");
export const schemaOut = path.join(apiRoot, "prisma", "schema.postgres.generated.prisma");

export function writePostgresSchema() {
  const source = fs.readFileSync(schemaSrc, "utf8");
  const schema = source.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  if (schema === source) throw new Error(`No sqlite provider found in ${schemaSrc}`);
  // Concurrent migrate runs on one filesystem must never read a half-written schema:
  // leave an identical file alone, otherwise replace it atomically.
  if (fs.existsSync(schemaOut) && fs.readFileSync(schemaOut, "utf8") === schema) return schemaOut;
  const tmp = `${schemaOut}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, schema);
  fs.renameSync(tmp, schemaOut);
  return schemaOut;
}

export function isPostgresUrl(url) {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

/** HOS_ENV wins over NODE_ENV, as in src/lib/env-validate.ts. */
export function deployedEnv() {
  const raw = (process.env.HOS_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage") return "staging";
  return null;
}
