/**
 * LifeOS public feed — offerings + business publications (no invented entities).
 */
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/lib/crypto.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";
process.env.PUBLIC_API_BASE_URL = "http://127.0.0.1:8800";
process.env.HOS_GUEST_PUBLIC_ORIGIN = "https://{subdomain}.getlifeos.app";

let app: FastifyInstance;
const prisma = new PrismaClient();

const hours = [{ day: "mon", open: "09:00", close: "17:00", closed: false }];

async function resetDb() {
  await prisma.businessPublication.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.offering.deleteMany();
  await prisma.catalog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.staffSession.deleteMany();
  await prisma.staffMember.deleteMany();
  await prisma.tenantModule.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();
}

before(async () => {
  execSync("npx prisma generate", { cwd: apiRoot, stdio: "inherit" });
  execSync("npx prisma db push --skip-generate", {
    cwd: apiRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
  app = await buildApp();
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

async function seedTenant() {
  const tenant = await prisma.tenant.create({
    data: {
      slug: "harbor",
      name: "Harbor Hotel",
      businessType: "hotel",
      status: "active",
      operatingHours: hours,
      settings: {},
    },
  });
  const catalog = await prisma.catalog.create({
    data: {
      tenantId: tenant.id,
      name: "Main",
      code: "main",
      currencyCode: "USD",
      status: "active",
      settings: {},
    },
  });
  const offering = await prisma.offering.create({
    data: {
      tenantId: tenant.id,
      catalogId: catalog.id,
      kind: "service",
      name: "Spa Day",
      code: "SPA-DAY",
      slug: "spa-day",
      description: "Full day spa access",
      status: "active",
      visibility: "public",
      basePrice: 120,
      currencyCode: "USD",
      tags: [],
      customAttributes: {},
      metadata: {},
    },
  });
  const media = await prisma.mediaAsset.create({
    data: {
      tenantId: tenant.id,
      offeringId: offering.id,
      url: "https://cdn.example.com/spa.jpg",
      kind: "image",
      altText: "Spa",
      isPublic: true,
      isCover: true,
    },
  });
  await prisma.staffMember.create({
    data: {
      tenantId: tenant.id,
      email: "staff@harbor.test",
      displayName: "Staff",
      role: "admin",
      status: "active",
      passwordHash: hashPassword("password123"),
      branchIds: [],
    },
  });
  return { tenant, offering, media };
}

test("GET /v1/public/lifeos/feed returns public offerings", async () => {
  await seedTenant();
  const res = await app.inject({
    method: "GET",
    url: "/v1/public/lifeos/feed?kind=offering&limit=10",
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as {
    items: Array<{ family: string; itemType: string; canonicalSourceUrl: string; title: string }>;
  };
  assert.ok(body.items.length >= 1);
  assert.equal(body.items[0].family, "catalogue");
  assert.equal(body.items[0].itemType, "offering");
  assert.equal(body.items[0].title, "Spa Day");
  assert.match(body.items[0].canonicalSourceUrl, /harbor\.getlifeos\.app\/catalog\//);
});

test("draft offerings are excluded", async () => {
  const { offering } = await seedTenant();
  await prisma.offering.update({ where: { id: offering.id }, data: { status: "draft" } });
  const res = await app.inject({ method: "GET", url: "/v1/public/lifeos/feed?kind=offering" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { items: unknown[] };
  assert.equal(body.items.length, 0);
});

test("staff can publish business media and it appears in feed", async () => {
  const { offering, media } = await seedTenant();
  const login = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { email: "staff@harbor.test", password: "password123", tenantSlug: "harbor" },
  });
  assert.equal(login.statusCode, 200, login.body);
  const setCookie = login.headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie.map(String).join("; ") : String(setCookie ?? "");

  const pub = await app.inject({
    method: "POST",
    url: "/staff/publications",
    headers: { cookie: cookieHeader },
    payload: {
      type: "photo",
      title: "Lobby sunset",
      caption: "Golden hour",
      mediaAssetIds: [media.id],
      relatedOfferingId: offering.id,
      publishNow: true,
    },
  });
  assert.equal(pub.statusCode, 201, pub.body);

  const feed = await app.inject({
    method: "GET",
    url: "/v1/public/lifeos/feed?kind=publication",
  });
  assert.equal(feed.statusCode, 200);
  const body = feed.json() as {
    items: Array<{ family: string; title: string; relatedItem: { id: string } | null }>;
  };
  assert.ok(body.items.some((i) => i.title === "Lobby sunset"));
  const hit = body.items.find((i) => i.title === "Lobby sunset");
  assert.equal(hit?.family, "publication");
  assert.equal(hit?.relatedItem?.id, offering.id);
});

test("GET /v1/public/publications/:id returns published item", async () => {
  const { media, offering, tenant } = await seedTenant();
  const created = await prisma.businessPublication.create({
    data: {
      tenantId: tenant.id,
      type: "photo",
      title: "Pool",
      caption: "Infinity pool",
      status: "published",
      audience: "public",
      mediaAssetIds: [media.id],
      relatedOfferingId: offering.id,
      publishedAt: new Date(),
    },
  });
  const res = await app.inject({
    method: "GET",
    url: `/v1/public/publications/${created.id}`,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { title: string; canonicalSourceUrl: string };
  assert.equal(body.title, "Pool");
  assert.match(body.canonicalSourceUrl, /\/p\//);
});
