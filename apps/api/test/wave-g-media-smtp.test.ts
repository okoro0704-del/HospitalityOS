/**
 * Phase Final — SMTP test endpoint + private media signed URLs.
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
import { signMediaAccess } from "../src/services/media-storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const testDbPath = path.join(apiRoot, "prisma", "test.db");
const mediaDir = path.join(apiRoot, "prisma", "test-media");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";
process.env.EMAIL_PROVIDER = "mock";
process.env.MEDIA_ROOT = mediaDir;
process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-32chars!!";

let app: FastifyInstance;
const prisma = new PrismaClient();
const hours = [{ day: "mon", open: "09:00", close: "17:00", closed: false }];

async function resetDb() {
  await prisma.communicationLog.deleteMany().catch(() => undefined);
  await prisma.mediaAsset.deleteMany().catch(() => undefined);
  await prisma.auditLog.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.organization.deleteMany();

  if (fs.existsSync(mediaDir)) {
    fs.rmSync(mediaDir, { recursive: true, force: true });
  }
  fs.mkdirSync(mediaDir, { recursive: true });

  const org = await prisma.organization.create({
    data: { name: "Media Org", slug: "media-org", metadata: {} },
  });
  const tenantA = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      name: "Tenant A",
      slug: "tenant-a-media",
      businessType: "hotel",
      status: "active",
      operatingHours: hours,
      settings: {},
    },
  });
  const tenantB = await prisma.tenant.create({
    data: {
      organizationId: org.id,
      name: "Tenant B",
      slug: "tenant-b-media",
      businessType: "hotel",
      status: "active",
      operatingHours: hours,
      settings: {},
    },
  });

  for (const t of [tenantA, tenantB]) {
    await prisma.branch.create({
      data: { tenantId: t.id, name: "Main", code: "MAIN", isPrimary: true, timezone: "UTC" },
    });
    for (const mid of ["notifications", "staff_management"]) {
      await prisma.tenantModule.create({
        data: { tenantId: t.id, moduleId: mid, enabled: true, config: {} },
      });
    }
    await prisma.staffMember.create({
      data: {
        tenantId: t.id,
        displayName: "Admin",
        email: t.slug === "tenant-a-media" ? "admin@a.media" : "admin@b.media",
        passwordHash: hashPassword("password123"),
        role: "admin",
        branchIds: [],
        status: "active",
      },
    });
  }
}

async function login(slug: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { tenantSlug: slug, email, password: "password123" },
  });
  assert.equal(res.statusCode, 200);
  return res.json() as { token: string; tenantId: string };
}

before(async () => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  // Recreate empty SQLite test DB (no --force-reset; Cursor blocks that flag).
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: "file:./test.db", NODE_ENV: "test" },
    stdio: "pipe",
  });
  app = await buildApp();
  await app.ready();
});

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

test("SMTP test endpoint: mock send + audit, never returns credentials", async () => {
  const auth = await login("tenant-a-media", "admin@a.media");
  const res = await app.inject({
    method: "POST",
    url: "/admin/communications/email/test",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { to: "ops@example.com", subject: "SMTP probe" },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.provider, "email_mock");
  assert.ok(!JSON.stringify(body).includes("SMTP_URL"));
  assert.ok(!JSON.stringify(body).includes("password"));

  const audit = await prisma.auditLog.findFirst({
    where: { action: "communications.email.test", tenantId: auth.tenantId },
  });
  assert.ok(audit);
  const meta = audit!.metadata as Record<string, unknown>;
  assert.equal(meta.ok, true);
  assert.ok(!JSON.stringify(meta).toLowerCase().includes("smtp://"));
});

test("SMTP test: forbidden without notifications.manage", async () => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "tenant-a-media" } });
  await prisma.staffMember.create({
    data: {
      tenantId: tenant.id,
      displayName: "Desk",
      email: "desk@a.media",
      passwordHash: hashPassword("password123"),
      role: "front_desk",
      branchIds: [],
      status: "active",
    },
  });
  const auth = await login("tenant-a-media", "desk@a.media");
  const res = await app.inject({
    method: "POST",
    url: "/admin/communications/email/test",
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { to: "ops@example.com" },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().error, "forbidden");
});

test("private media: upload + signed URL + staff content + tenant IDOR", async () => {
  const a = await login("tenant-a-media", "admin@a.media");
  const b = await login("tenant-b-media", "admin@b.media");

  const upload = await app.inject({
    method: "POST",
    url: "/media/upload",
    headers: { authorization: `Bearer ${a.token}` },
    payload: {
      filename: "receipt.txt",
      contentType: "text/plain",
      dataBase64: Buffer.from("secret-receipt-a").toString("base64"),
      kind: "receipt",
    },
  });
  assert.equal(upload.statusCode, 200);
  const mediaId = upload.json().media.id as string;

  const idorMeta = await app.inject({
    method: "GET",
    url: `/media/${mediaId}`,
    headers: { authorization: `Bearer ${b.token}` },
  });
  assert.equal(idorMeta.statusCode, 404);

  const idorContent = await app.inject({
    method: "GET",
    url: `/media/${mediaId}/content`,
    headers: { authorization: `Bearer ${b.token}` },
  });
  assert.equal(idorContent.statusCode, 404);

  const signed = await app.inject({
    method: "POST",
    url: `/media/${mediaId}/signed-url`,
    headers: { authorization: `Bearer ${a.token}` },
    payload: { ttlSeconds: 120 },
  });
  assert.equal(signed.statusCode, 200);
  const signedUrl = signed.json().url as string;

  const ok = await app.inject({ method: "GET", url: signedUrl });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, "secret-receipt-a");

  const staffOk = await app.inject({
    method: "GET",
    url: `/media/${mediaId}/content`,
    headers: { authorization: `Bearer ${a.token}` },
  });
  assert.equal(staffOk.statusCode, 200);
});

test("private media: expired signed URL fails", async () => {
  const a = await login("tenant-a-media", "admin@a.media");
  const upload = await app.inject({
    method: "POST",
    url: "/media/upload",
    headers: { authorization: `Bearer ${a.token}` },
    payload: {
      filename: "doc.txt",
      contentType: "text/plain",
      dataBase64: Buffer.from("x").toString("base64"),
    },
  });
  const mediaId = upload.json().media.id as string;
  const media = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });
  const exp = Math.floor(Date.now() / 1000) - 10;
  const sig = signMediaAccess({ mediaId, tenantId: media.tenantId, expUnix: exp });
  const res = await app.inject({
    method: "GET",
    url: `/media/${mediaId}/content?exp=${exp}&sig=${sig}`,
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, "unauthorized");
});

test("private media: deleted cannot be retrieved", async () => {
  const a = await login("tenant-a-media", "admin@a.media");
  const upload = await app.inject({
    method: "POST",
    url: "/media/upload",
    headers: { authorization: `Bearer ${a.token}` },
    payload: {
      filename: "gone.txt",
      contentType: "text/plain",
      dataBase64: Buffer.from("bye").toString("base64"),
    },
  });
  const mediaId = upload.json().media.id as string;
  const signed = await app.inject({
    method: "POST",
    url: `/media/${mediaId}/signed-url`,
    headers: { authorization: `Bearer ${a.token}` },
    payload: {},
  });
  const signedUrl = signed.json().url as string;

  const del = await app.inject({
    method: "DELETE",
    url: `/media/${mediaId}`,
    headers: { authorization: `Bearer ${a.token}` },
  });
  assert.equal(del.statusCode, 200);

  const after = await app.inject({ method: "GET", url: signedUrl });
  assert.equal(after.statusCode, 404);

  const meta = await app.inject({
    method: "GET",
    url: `/media/${mediaId}`,
    headers: { authorization: `Bearer ${a.token}` },
  });
  assert.equal(meta.statusCode, 404);
});

test("private media: rejects disallowed content type", async () => {
  const a = await login("tenant-a-media", "admin@a.media");
  const res = await app.inject({
    method: "POST",
    url: "/media/upload",
    headers: { authorization: `Bearer ${a.token}` },
    payload: {
      filename: "x.exe",
      contentType: "application/x-msdownload",
      dataBase64: Buffer.from("MZ").toString("base64"),
    },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "validation_error");
});
