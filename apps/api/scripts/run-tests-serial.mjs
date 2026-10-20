#!/usr/bin/env node
/**
 * Run each API test file in its own process (Windows SQLite lock safety).
 *
 * HOS_TEST_BLOCKED=<file>[,<file>...] names test files whose external prerequisites are absent
 * in this environment. They are reported as BLOCKED, not run and not counted as passed.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDir = path.join(apiRoot, "test");
const blocked = new Set(
  (process.env.HOS_TEST_BLOCKED ?? "").split(",").map((f) => f.trim()).filter(Boolean),
);
const allFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();
for (const name of blocked) {
  if (!allFiles.includes(name)) {
    console.error(`HOS_TEST_BLOCKED names a test file that does not exist: ${name}`);
    process.exit(2);
  }
}
const files = allFiles.filter((f) => !blocked.has(f));

let failed = 0;
let passedFiles = 0;
const failures = [];

for (const file of blocked) {
  console.log(`\n═══ ${file} ═══ BLOCKED (external prerequisites unavailable; not run)`);
}

for (const file of files) {
  console.log(`\n═══ ${file} ═══`);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      path.join(testDir, file),
    ],
    {
      cwd: apiRoot,
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "file:./test.db" },
      stdio: "inherit",
      shell: false,
    },
  );
  if (result.status === 0) {
    passedFiles++;
  } else {
    failed++;
    failures.push(file);
  }
}

console.log(
  `\n═══ Summary: ${passedFiles}/${files.length} files passed` +
    (blocked.size ? `; ${blocked.size} BLOCKED: ${[...blocked].join(", ")}` : "") +
    " ═══",
);
if (failures.length) {
  console.log("Failed files:", failures.join(", "));
  process.exit(1);
}
