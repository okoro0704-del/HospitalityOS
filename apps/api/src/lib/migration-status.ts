import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PostgreSQL migration state, read from Prisma Migrate's `_prisma_migrations` table and
 * compared with the migrations shipped in this build (`prisma/migrations`).
 * Deployed environments serve traffic only when every shipped migration has finished.
 */
export type MigrationState =
  | "ok"
  | "skipped" // not PostgreSQL (local SQLite development and tests)
  | "not_migrated" // no migration has ever been applied
  | "pending" // some shipped migrations are not applied yet
  | "failed" // a migration started and did not finish (failed or still running)
  | "unknown_applied"; // the database has migrations this build does not ship

export type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export type MigrationReport = {
  state: MigrationState;
  expected: number;
  applied: number;
  pending: string[];
  failed: string[];
  unknown: string[];
};

type RawQueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

// src/lib and dist/lib are both two levels below the API package root.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MIGRATIONS_DIR = path.join(apiRoot, "prisma", "migrations");

export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

/** Migration directory names shipped with this build, in apply order. */
export function expectedMigrations(dir = MIGRATIONS_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

export function evaluateMigrations(expected: string[], rows: MigrationRow[] | null): MigrationReport {
  if (rows === null) {
    return { state: "not_migrated", expected: expected.length, applied: 0, pending: [...expected], failed: [], unknown: [] };
  }
  const failed = rows.filter((r) => r.finished_at === null && r.rolled_back_at === null).map((r) => r.migration_name);
  const applied = new Set(
    rows.filter((r) => r.finished_at !== null && r.rolled_back_at === null).map((r) => r.migration_name),
  );
  const shipped = new Set(expected);
  const pending = expected.filter((name) => !applied.has(name));
  const unknown = [...applied].filter((name) => !shipped.has(name)).sort();
  let state: MigrationState = "ok";
  if (failed.length) state = "failed";
  else if (applied.size === 0) state = "not_migrated";
  else if (pending.length) state = "pending";
  else if (unknown.length) state = "unknown_applied";
  return { state, expected: expected.length, applied: applied.size, pending, failed, unknown };
}

/** `null` when Prisma Migrate has never run against this database. */
export async function readMigrationRows(db: RawQueryClient): Promise<MigrationRow[] | null> {
  const [table] = await db.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT to_regclass('_prisma_migrations') IS NOT NULL AS "present"`,
  );
  if (!table?.present) return null;
  return db.$queryRawUnsafe<MigrationRow[]>(
    `SELECT "migration_name", "finished_at", "rolled_back_at" FROM "_prisma_migrations"`,
  );
}

export async function checkMigrations(db: RawQueryClient, databaseUrl: string): Promise<MigrationReport> {
  if (!isPostgresUrl(databaseUrl)) {
    return { state: "skipped", expected: 0, applied: 0, pending: [], failed: [], unknown: [] };
  }
  return evaluateMigrations(expectedMigrations(), await readMigrationRows(db));
}

export function describeMigrationReport(report: MigrationReport): string {
  const parts = [`state=${report.state}`, `applied=${report.applied}/${report.expected}`];
  if (report.failed.length) parts.push(`failed=${report.failed.join(",")}`);
  if (report.pending.length) parts.push(`pending=${report.pending.join(",")}`);
  if (report.unknown.length) parts.push(`not-in-this-build=${report.unknown.join(",")}`);
  return parts.join(" ");
}
