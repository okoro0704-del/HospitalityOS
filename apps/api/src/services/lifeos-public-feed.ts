/**
 * LifeOS public discovery feed — HospitalityOS remains source of truth.
 * Catalogue = Offering; business media = BusinessPublication + MediaAsset (Drive).
 * LifeOS consumes URLs only; no Hospitality entity duplication.
 */
import { prisma } from "../db.js";
import { config } from "../config.js";

export type LifeOsFeedKind = "offering" | "publication" | "all";

export type LifeOsAssetRef = {
  assetId: string;
  href: string;
  kind: "image" | "video" | "file";
  alt: string | null;
};

export type LifeOsFeedItem = {
  family: "catalogue" | "publication";
  applicationId: "hospitalityos";
  itemType: "offering" | "photo" | "video" | "post";
  canonicalItemId: string;
  title: string;
  summary: string | null;
  assetReferences: LifeOsAssetRef[];
  canonicalSourceUrl: string;
  tenant: { slug: string; displayName: string };
  price: { amount: string; currency: string } | null;
  provenance: {
    sourceApplicationId: "hospitalityos";
    sourceTenantSlug: string;
    sourceItemId: string;
  };
  relatedItem: {
    kind: "offering";
    id: string;
    canonicalSourceUrl: string;
  } | null;
  publishedAt: string | null;
};

const PUBLIC_OFFERING_STATUSES = ["active", "featured", "published"] as const;

function publicApiBase(): string {
  const fromEnv = (process.env.PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    return "https://hospitalityos-api-production.up.railway.app";
  }
  return `http://127.0.0.1:${config.port}`;
}

export function hospitalityGuestOrigin(slug: string): string {
  const tpl =
    process.env.HOS_GUEST_PUBLIC_ORIGIN ??
    process.env.HOS_GUEST_LAUNCH_URL ??
    "https://{subdomain}.getlifeos.app";
  return tpl.replace("{subdomain}", slug).replace(/\/(guest|staff)\/?$/, "");
}

export function offeringCanonicalUrl(slug: string, offeringId: string): string {
  return `${hospitalityGuestOrigin(slug)}/catalog/${offeringId}`;
}

export function publicationCanonicalUrl(slug: string, publicationId: string): string {
  return `${hospitalityGuestOrigin(slug)}/p/${publicationId}`;
}

export function mediaProxyHref(assetId: string): string {
  return `${publicApiBase()}/v1/public/media/${assetId}`;
}

function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: publishedAt.toISOString(), id }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(raw: string | undefined): { t: Date; id: string } | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      t?: string;
      id?: string;
    };
    if (!parsed.t || !parsed.id) return null;
    const t = new Date(parsed.t);
    if (Number.isNaN(t.getTime())) return null;
    return { t, id: parsed.id };
  } catch {
    return null;
  }
}

function assetKind(kind: string): "image" | "video" | "file" {
  const k = kind.toLowerCase();
  if (k === "video") return "video";
  if (k === "image" || k === "photo") return "image";
  return "file";
}

function publicationItemType(type: string): "photo" | "video" | "post" {
  const t = type.toLowerCase();
  if (t === "video") return "video";
  if (t === "photo" || t === "image") return "photo";
  return "post";
}

type OfferingRow = {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  currencyCode: string;
  updatedAt: Date;
  createdAt: Date;
  catalog: { tenant: { slug: string; name: string } };
  media: Array<{
    id: string;
    kind: string;
    altText: string | null;
    isCover: boolean;
    sortOrder: number;
    deletedAt: Date | null;
  }>;
};

type PubRow = {
  id: string;
  type: string;
  title: string;
  caption: string;
  mediaAssetIds: unknown;
  relatedOfferingId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  tenant: { slug: string; name: string };
};

function mapOffering(row: OfferingRow): LifeOsFeedItem {
  const media = [...row.media]
    .filter((m) => !m.deletedAt)
    .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);
  const amount =
    row.basePrice != null && Number.isFinite(row.basePrice)
      ? Number(row.basePrice).toFixed(2)
      : null;
  const tenant = row.catalog.tenant;
  return {
    family: "catalogue",
    applicationId: "hospitalityos",
    itemType: "offering",
    canonicalItemId: `hos:offering:${row.id}`,
    title: row.name,
    summary: row.description,
    assetReferences: media.map((m) => ({
      assetId: m.id,
      href: mediaProxyHref(m.id),
      kind: assetKind(m.kind),
      alt: m.altText,
    })),
    canonicalSourceUrl: offeringCanonicalUrl(tenant.slug, row.id),
    tenant: { slug: tenant.slug, displayName: tenant.name },
    price: amount ? { amount, currency: row.currencyCode || "USD" } : null,
    provenance: {
      sourceApplicationId: "hospitalityos",
      sourceTenantSlug: tenant.slug,
      sourceItemId: row.id,
    },
    relatedItem: null,
    publishedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  };
}

function mapPublication(
  row: PubRow,
  assets: Map<string, { id: string; kind: string; altText: string | null }>,
): LifeOsFeedItem {
  const ids = Array.isArray(row.mediaAssetIds)
    ? (row.mediaAssetIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const assetReferences: LifeOsAssetRef[] = [];
  for (const id of ids) {
    const a = assets.get(id);
    if (!a) continue;
    assetReferences.push({
      assetId: a.id,
      href: mediaProxyHref(a.id),
      kind: assetKind(a.kind),
      alt: a.altText,
    });
  }
  const related = row.relatedOfferingId
    ? {
        kind: "offering" as const,
        id: row.relatedOfferingId,
        canonicalSourceUrl: offeringCanonicalUrl(row.tenant.slug, row.relatedOfferingId),
      }
    : null;
  return {
    family: "publication",
    applicationId: "hospitalityos",
    itemType: publicationItemType(row.type),
    canonicalItemId: `hos:publication:${row.id}`,
    title: row.title || row.caption.slice(0, 80) || "Publication",
    summary: row.caption || null,
    assetReferences,
    canonicalSourceUrl: publicationCanonicalUrl(row.tenant.slug, row.id),
    tenant: { slug: row.tenant.slug, displayName: row.tenant.name },
    price: null,
    provenance: {
      sourceApplicationId: "hospitalityos",
      sourceTenantSlug: row.tenant.slug,
      sourceItemId: row.id,
    },
    relatedItem: related,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
  };
}

export async function listLifeOsPublicFeed(opts: {
  kind?: LifeOsFeedKind;
  cursor?: string;
  limit?: number;
  tenantSlug?: string;
}): Promise<{ items: LifeOsFeedItem[]; nextCursor: string | null }> {
  const kind: LifeOsFeedKind = opts.kind ?? "all";
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 50);
  const cursor = decodeCursor(opts.cursor);
  const tenantFilter = opts.tenantSlug?.trim()
    ? { slug: opts.tenantSlug.trim(), status: "active" as const }
    : { status: "active" as const };

  const wantOfferings = kind === "offering" || kind === "all";
  const wantPubs = kind === "publication" || kind === "all";

  const offeringWhere = {
    visibility: "public",
    status: { in: [...PUBLIC_OFFERING_STATUSES] },
    catalog: { tenant: tenantFilter },
    ...(cursor
      ? {
          OR: [
            { updatedAt: { lt: cursor.t } },
            { updatedAt: cursor.t, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const pubWhere = {
    status: "published",
    audience: "public",
    publishedAt: { not: null as null },
    tenant: tenantFilter,
    ...(cursor
      ? {
          OR: [
            { publishedAt: { lt: cursor.t } },
            { publishedAt: cursor.t, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const [offerings, publications] = await Promise.all([
    wantOfferings
      ? prisma.offering.findMany({
          where: offeringWhere,
          include: {
            catalog: {
              include: {
                tenant: { select: { slug: true, name: true } },
              },
            },
            media: {
              where: { deletedAt: null, isPublic: true },
              orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
              take: 8,
            },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        })
      : Promise.resolve([]),
    wantPubs
      ? prisma.businessPublication.findMany({
          where: pubWhere,
          include: {
            tenant: { select: { slug: true, name: true } },
          },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        })
      : Promise.resolve([]),
  ]);

  const allAssetIds = new Set<string>();
  for (const p of publications) {
    if (!Array.isArray(p.mediaAssetIds)) continue;
    for (const id of p.mediaAssetIds as unknown[]) {
      if (typeof id === "string") allAssetIds.add(id);
    }
  }
  const assetRows =
    allAssetIds.size > 0
      ? await prisma.mediaAsset.findMany({
          where: {
            id: { in: [...allAssetIds] },
            deletedAt: null,
            isPublic: true,
          },
          select: { id: true, kind: true, altText: true },
        })
      : [];
  const assetMap = new Map(assetRows.map((a) => [a.id, a]));

  type Ranked = { sortAt: Date; id: string; item: LifeOsFeedItem };
  const ranked: Ranked[] = [
    ...offerings.map((o) => ({
      sortAt: o.updatedAt,
      id: o.id,
      item: mapOffering(o as OfferingRow),
    })),
    ...publications.map((p) => ({
      sortAt: p.publishedAt ?? p.createdAt,
      id: p.id,
      item: mapPublication(p as PubRow, assetMap),
    })),
  ];

  ranked.sort((a, b) => {
    const dt = b.sortAt.getTime() - a.sortAt.getTime();
    if (dt !== 0) return dt;
    return b.id.localeCompare(a.id);
  });

  const page = ranked.slice(0, limit);
  const hasMore = ranked.length > limit;
  const last = page[page.length - 1];
  return {
    items: page.map((r) => r.item),
    nextCursor: hasMore && last ? encodeCursor(last.sortAt, last.id) : null,
  };
}

export async function getPublicPublicationById(id: string) {
  const pub = await prisma.businessPublication.findFirst({
    where: {
      id,
      status: "published",
      audience: "public",
      publishedAt: { not: null },
      tenant: { status: "active" },
    },
    include: { tenant: { select: { slug: true, name: true } } },
  });
  if (!pub) return null;
  const ids = Array.isArray(pub.mediaAssetIds)
    ? (pub.mediaAssetIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const assets =
    ids.length > 0
      ? await prisma.mediaAsset.findMany({
          where: { id: { in: ids }, deletedAt: null, isPublic: true },
          select: { id: true, kind: true, altText: true },
        })
      : [];
  return mapPublication(pub as PubRow, new Map(assets.map((a) => [a.id, a])));
}

export async function streamPublicMediaAsset(assetId: string): Promise<{
  body: Uint8Array;
  contentType: string;
} | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: assetId,
      deletedAt: null,
      isPublic: true,
      tenant: { status: "active" },
    },
  });
  if (!asset) return null;

  if (asset.url?.startsWith("https://")) {
    try {
      const res = await fetch(asset.url);
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      return {
        body: buf,
        contentType: asset.contentType || res.headers.get("content-type") || "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  // Private blob path (optional local MEDIA_ROOT) — no world-readable URL.
  if (asset.storageKey) {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const root = process.env.MEDIA_ROOT ?? "./media-private";
      const full = path.resolve(root, asset.storageKey);
      const rootResolved = path.resolve(root);
      if (!full.startsWith(rootResolved)) return null;
      const bytes = await fs.readFile(full);
      return {
        body: new Uint8Array(bytes),
        contentType: asset.contentType || "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  return null;
}

export async function createBusinessPublication(input: {
  tenantId: string;
  type: "photo" | "video" | "post";
  title?: string;
  caption?: string;
  mediaAssetIds: string[];
  relatedOfferingId?: string | null;
  publishNow?: boolean;
}) {
  if (!input.mediaAssetIds.length) {
    throw Object.assign(new Error("At least one media asset is required"), {
      code: "media_required",
      statusCode: 400,
    });
  }
  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: { in: input.mediaAssetIds },
      tenantId: input.tenantId,
      deletedAt: null,
    },
  });
  if (assets.length !== input.mediaAssetIds.length) {
    throw Object.assign(new Error("One or more media assets were not found in this tenant"), {
      code: "media_not_found",
      statusCode: 400,
    });
  }
  // Public LifeOS discovery requires isPublic media references (bytes stay on Drive).
  await prisma.mediaAsset.updateMany({
    where: { id: { in: input.mediaAssetIds }, tenantId: input.tenantId },
    data: { isPublic: true },
  });
  if (input.relatedOfferingId) {
    const offering = await prisma.offering.findFirst({
      where: { id: input.relatedOfferingId, tenantId: input.tenantId },
    });
    if (!offering) {
      throw Object.assign(new Error("Related offering not found"), {
        code: "offering_not_found",
        statusCode: 400,
      });
    }
  }
  const publishNow = input.publishNow !== false;
  return prisma.businessPublication.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      title: (input.title ?? "").trim(),
      caption: (input.caption ?? "").trim(),
      status: publishNow ? "published" : "draft",
      audience: "public",
      relatedOfferingId: input.relatedOfferingId ?? null,
      mediaAssetIds: input.mediaAssetIds,
      publishedAt: publishNow ? new Date() : null,
    },
  });
}
