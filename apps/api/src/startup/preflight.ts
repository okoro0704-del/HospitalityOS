import { config } from "../config.js";
import { prisma } from "../db.js";
import { isDeployedEnv, type AppEnv } from "../lib/env-validate.js";
import {
  checkMigrations,
  describeMigrationReport,
  isPostgresUrl,
  type MigrationReport,
} from "../lib/migration-status.js";

export class StartupPreflightError extends Error {}

/**
 * Runs before the API listens. In deployed environments (staging, production) it refuses to
 * serve unless the database is reachable, the Prisma client was built for PostgreSQL, and every
 * migration shipped with this build has finished. Migrations themselves run once per deploy in
 * the pre-deploy step (`npm run db:migrate:deploy`), never here, so concurrent instances only read.
 */
export async function runStartupPreflight(
  opts: { env: AppEnv; databaseUrl: string } = { env: config.env, databaseUrl: config.databaseUrl },
): Promise<MigrationReport | null> {
  if (!isDeployedEnv(opts.env)) return null;
  if (!isPostgresUrl(opts.databaseUrl)) {
    throw new StartupPreflightError(`${opts.env} requires a PostgreSQL DATABASE_URL; SQLite is development-only.`);
  }

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/must start with the protocol `file:`/i.test(message)) {
      throw new StartupPreflightError(
        "The Prisma client was generated for SQLite. Deployed builds must run `npm run build:api:pg`.",
      );
    }
    throw new StartupPreflightError("The database is unreachable; refusing to start.");
  }

  const report = await checkMigrations(prisma, opts.databaseUrl);
  if (report.state !== "ok") {
    throw new StartupPreflightError(
      `Database migrations are not complete (${describeMigrationReport(report)}). ` +
        "Run `npm run db:migrate:deploy -w @hospitalityos/api` (the pre-deploy step) and redeploy.",
    );
  }
  return report;
}
