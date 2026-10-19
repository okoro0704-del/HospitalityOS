#!/usr/bin/env node
/**
 * Production-style backup / restore helpers for PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/pg-backup.mjs backup
 *   DATABASE_URL=postgresql://... node scripts/pg-backup.mjs restore <file.dump>
 *   DATABASE_URL=postgresql://... node scripts/pg-backup.mjs verify
 *
 * Requires pg_dump / pg_restore / psql on PATH (or PG_BIN).
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const backupsDir = path.join(apiRoot, "backups");
const url = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";

if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
  console.error("pg-backup requires a postgres DATABASE_URL");
  process.exit(1);
}

const bin = process.env.PG_BIN ? `${process.env.PG_BIN}${path.sep}` : "";
const cmd = process.argv[2] || "backup";
fs.mkdirSync(backupsDir, { recursive: true });

function run(tool, args) {
  const r = spawnSync(`${bin}${tool}`, args, { stdio: "inherit", shell: true, env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (cmd === "backup") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(backupsDir, `hos-${stamp}.dump`);
  console.log(`Creating backup → ${out}`);
  run("pg_dump", ["--format=custom", "--file", out, url]);
  const evidence = path.join(backupsDir, `hos-${stamp}.evidence.json`);
  fs.writeFileSync(
    evidence,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        file: out,
        bytes: fs.statSync(out).size,
        tool: "pg_dump --format=custom",
        note: "Restore must be verified before treating backup as valid",
      },
      null,
      2,
    ),
  );
  console.log(`Backup complete (${fs.statSync(out).size} bytes). Evidence: ${evidence}`);
} else if (cmd === "restore") {
  const file = process.argv[3];
  if (!file || !fs.existsSync(file)) {
    console.error("Usage: node scripts/pg-backup.mjs restore <file.dump>");
    process.exit(1);
  }
  console.log(`Restoring ${file} → ${url.replace(/:[^:@]+@/, ":***@")}`);
  run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", url, file]);
  console.log("Restore finished — run verify next.");
} else if (cmd === "verify") {
  console.log("Verifying core tables via psql…");
  const sql = `
SELECT 'organization' AS t, count(*)::text AS c FROM "Organization"
UNION ALL SELECT 'tenant', count(*)::text FROM "Tenant"
UNION ALL SELECT 'customer', count(*)::text FROM "Customer"
UNION ALL SELECT 'staff', count(*)::text FROM "StaffMember"
UNION ALL SELECT 'invoice', count(*)::text FROM "Invoice"
UNION ALL SELECT 'payment', count(*)::text FROM "Payment"
UNION ALL SELECT 'audit', count(*)::text FROM "AuditLog";
`;
  run("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", sql]);
} else {
  console.error("Unknown command. Use backup | restore | verify");
  process.exit(1);
}
