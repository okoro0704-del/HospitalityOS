/**
 * Staff management cannot be used to gain or take over a privileged account.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const dbFile = path.join(apiRoot, "prisma", "privilege-test.db");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./privilege-test.db";

const { prisma } = await import("../src/db.js");
const { hashPassword } = await import("../src/lib/crypto.js");

const PASSWORD = "synthetic-pass-1";
let app: FastifyInstance;
let tenantId = "";
const ids: Record<string, string> = {};

async function login(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: "privilege-hotel", email, password: PASSWORD },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().token as string;
}

function asStaff(token: string, method: "POST" | "PATCH" | "DELETE", url: string, payload?: object) {
  return app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload ?? {} });
}

before(async () => {
  for (const f of [dbFile, `${dbFile}-journal`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./privilege-test.db" },
    stdio: "pipe",
  });
  const tenant = await prisma.tenant.create({
    data: {
      slug: "privilege-hotel", name: "Privilege Hotel", businessType: "hotel",
      operatingHours: [], settings: {}, status: "active",
    },
  });
  tenantId = tenant.id;
  for (const role of ["owner", "admin", "manager", "front_desk"]) {
    const staff = await prisma.staffMember.create({
      data: {
        tenantId, displayName: role, email: `${role}@privilege.test`,
        passwordHash: hashPassword(PASSWORD), role, branchIds: [], status: "active",
      },
    });
    ids[role] = staff.id;
  }
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

test("a manager cannot create owners or admins, only lower roles", async () => {
  const manager = await login("manager@privilege.test");
  for (const role of ["owner", "admin", "administrator"]) {
    const res = await asStaff(manager, "POST", "/staff", {
      displayName: `Wannabe ${role}`, email: `m-${role}@privilege.test`, password: "long-enough-1", role,
    });
    assert.equal(res.statusCode, 403, `${role}: ${res.body}`);
  }
  const ok = await asStaff(manager, "POST", "/staff", {
    displayName: "Desk", email: "m-desk@privilege.test", password: "long-enough-1", role: "front_desk",
  });
  assert.equal(ok.statusCode, 201, ok.body);
});

test("an admin cannot create, edit, deactivate or re-link an owner", async () => {
  const admin = await login("admin@privilege.test");
  const create = await asStaff(admin, "POST", "/staff", {
    displayName: "Second owner", email: "a-owner@privilege.test", password: "long-enough-1", role: "owner",
  });
  assert.equal(create.statusCode, 403, create.body);

  const takeover = await asStaff(admin, "PATCH", `/staff/${ids.owner}`, {
    email: "attacker@privilege.test", password: "attacker-pass-1",
  });
  assert.equal(takeover.statusCode, 403, takeover.body);
  const owner = await prisma.staffMember.findUniqueOrThrow({ where: { id: ids.owner } });
  assert.equal(owner.email, "owner@privilege.test", "owner email unchanged");

  const disable = await asStaff(admin, "DELETE", `/staff/${ids.owner}`);
  assert.equal(disable.statusCode, 403, disable.body);

  const link = await asStaff(admin, "POST", `/staff/${ids.owner}/trustid`, {
    trustId: "TID-0000000000000000000000000000beef",
  });
  assert.equal(link.statusCode, 403, link.body);
});

test("a manager cannot link an identity to an admin's membership", async () => {
  const manager = await login("manager@privilege.test");
  const link = await asStaff(manager, "POST", `/staff/${ids.admin}/trustid`, {
    trustId: "TID-00000000000000000000000000000bad",
  });
  assert.equal(link.statusCode, 403, link.body);
});

test("nobody can change their own role or status", async () => {
  const admin = await login("admin@privilege.test");
  const res = await asStaff(admin, "PATCH", `/staff/${ids.admin}`, { role: "owner" });
  assert.equal(res.statusCode, 403, res.body);
});

test("an owner can appoint admins, and a role change ends the member's sessions", async () => {
  const owner = await login("owner@privilege.test");
  const deskToken = await login("front_desk@privilege.test");
  const before = await app.inject({ method: "GET", url: "/auth/staff/me", headers: { authorization: `Bearer ${deskToken}` } });
  assert.equal(before.statusCode, 200);

  const promote = await asStaff(owner, "PATCH", `/staff/${ids.front_desk}`, { role: "admin" });
  assert.equal(promote.statusCode, 200, promote.body);

  const stale = await app.inject({ method: "GET", url: "/auth/staff/me", headers: { authorization: `Bearer ${deskToken}` } });
  assert.equal(stale.statusCode, 401, "the session issued under the old role no longer works");
});

test("the last active owner cannot be demoted or deactivated", async () => {
  const { updateStaffMember } = await import("../src/services/staff-management.js");
  // Simulates a second owner acting on the only active owner.
  await assert.rejects(
    updateStaffMember({ tenantId, staffId: ids.owner, actorId: "another-owner", actorRole: "owner", rawBody: { role: "admin" } }),
    (err: { code?: string }) => err.code === "last_owner",
  );
});
