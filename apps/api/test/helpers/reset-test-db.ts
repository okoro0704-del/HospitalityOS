/**
 * Windows-safe SQLite test DB reset.
 * Disconnects shared + local Prisma clients before unlinking (avoids EBUSY).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

export async function resetSqliteTestDatabase(opts: {
  apiRoot: string;
  /** Local test PrismaClient instance(s) to disconnect first */
  clients?: Array<PrismaClient | null | undefined>;
  databaseUrl?: string;
}) {
  const testDbPath = path.join(opts.apiRoot, "prisma", "test.db");
  const url = opts.databaseUrl ?? "file:./test.db";

  try {
    const { prisma: appPrisma } = await import("../../src/db.js");
    await appPrisma.$disconnect().catch(() => undefined);
  } catch {
    // ignore
  }

  for (const client of opts.clients ?? []) {
    if (client) await client.$disconnect().catch(() => undefined);
  }

  const files = [testDbPath, `${testDbPath}-journal`, `${testDbPath}-wal`, `${testDbPath}-shm`];
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      for (const file of files) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") throw err;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }

  execSync("npx prisma db push --skip-generate", {
    cwd: opts.apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
