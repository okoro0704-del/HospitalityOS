/**
 * Fitness facility branch isolation (Final Production Completion).
 */
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/lib/crypto.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";

let app: FastifyInstance;
const prisma = new PrismaClient();
const hours = [{ day: "mon", open: "09:00", close: "17:00", closed: false }];

let branchAId = "";
let branchBId = "";

async function resetDb() {
  await prisma.staffSession.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.fitnessArea.deleteMany().catch(() => undefined);
  await prisma.fitnessFacility.deleteMany().catch(() => undefined);
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.auditLog.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "Fit Org", slug: "fit-org", metadata: {} },
  });
  const tenant = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      name: "Peak Wave",
      slug: "peak-wave",
      businessType: "gym",
      status: "active",
      operatingHours: hours,
      settings: {},
    },
  });
  const a = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "A", code: "A", isPrimary: true, timezone: "UTC" },
  });
  const b = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "B", code: "B", isPrimary: false, timezone: "UTC" },
  });
  branchAId = a.id;
  branchBId = b.id;

  for (const mid of ["gym_membership", "fitness_classes", "staff_management"]) {
    await prisma.tenantModule.create({
      data: { tenantId: tenant.id, moduleId: mid, enabled: true, config: {} },
    });
  }

  await prisma.staffMember.create({
    data: {
      tenantId: tenant.id,
      displayName: "Desk A",
      email: "desk-a@peak.wave",
      passwordHash: hashPassword("password123"),
      role: "front_desk",
      branchIds: [branchAId],
      status: "active",
    },
  });

  await prisma.fitnessFacility.create({
    data: {
      tenantId: tenant.id,
      branchId: branchAId,
      name: "Gym A",
      code: "GA",
      metadata: {},
      status: "active",
    },
  });
  await prisma.fitnessFacility.create({
    data: {
      tenantId: tenant.id,
      branchId: branchBId,
      name: "Gym B",
      code: "GB",
      metadata: {},
      status: "active",
    },
  });
}

before(async () => {
  for (const f of [testDbPath, `${testDbPath}-journal`, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
  app = await buildApp();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

test("fitness: branch-scoped staff only lists own-branch facilities", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: {
      tenantSlug: "peak-wave",
      email: "desk-a@peak.wave",
      password: "password123",
    },
  });
  assert.equal(login.statusCode, 200, login.body);
  const list = await app.inject({
    method: "GET",
    url: "/fitness/facilities",
    headers: { authorization: `Bearer ${login.json().token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const facilities = (list.json() as { facilities: Array<{ code: string; branchId: string | null }> })
    .facilities;
  assert.equal(facilities.length, 1);
  assert.equal(facilities[0].code, "GA");
  assert.equal(facilities[0].branchId, branchAId);
});
