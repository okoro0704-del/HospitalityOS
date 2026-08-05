import type { Prisma } from "@prisma/client";
import {
  DEFAULT_SALES_CHANNELS,
  type OfferingKind,
  type PriceQuote,
} from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { checkAvailability, createBooking } from "./booking-engine.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function ensureDefaultCatalog(tenantId: string) {
  let catalog = await prisma.catalog.findFirst({
    where: { tenantId, code: "default" },
  });
  if (!catalog) {
    catalog = await prisma.catalog.create({
      data: {
        tenantId,
        name: "Main catalog",
        code: "default",
        currencyCode: "USD",
        settings: {},
        status: "active",
      },
    });
  }

  await prisma.currency.upsert({
    where: { tenantId_code: { tenantId, code: "USD" } },
    create: { tenantId, code: "USD", name: "US Dollar", symbol: "$", isDefault: true },
    update: { isDefault: true },
  });

  for (const ch of DEFAULT_SALES_CHANNELS) {
    await prisma.salesChannel.upsert({
      where: { tenantId_code: { tenantId, code: ch.code } },
      create: { tenantId, code: ch.code, name: ch.name, status: "active" },
      update: { name: ch.name },
    });
  }

  await prisma.taxRule.findFirst({ where: { tenantId, status: "active" } }).then(async (existing) => {
    if (!existing) {
      await prisma.taxRule.create({
        data: {
          tenantId,
          name: "Standard tax",
          ratePercent: 0,
          inclusive: false,
          status: "active",
        },
      });
    }
  });

  return catalog;
}

export async function listOfferings(opts: {
  tenantId: string;
  kind?: OfferingKind | string;
  categoryId?: string;
  status?: string;
  q?: string;
  visibility?: string;
  featured?: boolean;
  guestFacing?: boolean;
}) {
  const where: Prisma.OfferingWhereInput = {
    tenantId: opts.tenantId,
    ...(opts.kind ? { kind: opts.kind } : {}),
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.featured != null ? { featured: opts.featured } : {}),
    ...(opts.guestFacing
      ? { status: { in: ["active", "featured"] }, visibility: "public" }
      : {}),
    ...(opts.q
      ? {
          OR: [
            { name: { contains: opts.q } },
            { code: { contains: opts.q } },
            { description: { contains: opts.q } },
          ],
        }
      : {}),
    ...(opts.visibility ? { visibility: opts.visibility } : {}),
  };

  return prisma.offering.findMany({
    where,
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      category: true,
      serviceDetail: true,
      productDetail: true,
      packageDetail: true,
      packageItemsAsPkg: { include: { child: true } },
      availabilityLinks: true,
      addons: true,
      relationsFrom: true,
    },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createOffering(opts: {
  tenantId: string;
  catalogId?: string;
  kind: OfferingKind;
  name: string;
  code: string;
  categoryId?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  basePrice?: number;
  currencyCode?: string;
  status?: string;
  visibility?: string;
  featured?: boolean;
  moduleId?: string | null;
  tags?: string[];
  customAttributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  // service
  durationMinutes?: number | null;
  bookable?: boolean;
  bookableResourceIds?: string[];
  // product
  sku?: string;
  barcode?: string | null;
  unit?: string;
  weight?: number | null;
  stockPlaceholder?: number | null;
  // package
  bundlePrice?: number | null;
  validityDays?: number | null;
  packageItems?: Array<{
    childOfferingId: string;
    quantity?: number;
    required?: boolean;
    optional?: boolean;
  }>;
  actorKind: string;
  actorId?: string | null;
}) {
  const catalog =
    opts.catalogId
      ? await prisma.catalog.findFirstOrThrow({
          where: { id: opts.catalogId, tenantId: opts.tenantId },
        })
      : await ensureDefaultCatalog(opts.tenantId);

  const slugBase = slugify(opts.code || opts.name);
  let slug = slugBase;
  let n = 1;
  while (await prisma.offering.findFirst({ where: { tenantId: opts.tenantId, slug } })) {
    slug = `${slugBase}-${n++}`;
  }

  const offering = await prisma.offering.create({
    data: {
      tenantId: opts.tenantId,
      catalogId: catalog.id,
      categoryId: opts.categoryId ?? null,
      kind: opts.kind,
      name: opts.name,
      code: opts.code,
      slug,
      description: opts.description ?? null,
      shortDescription: opts.shortDescription ?? null,
      basePrice: opts.basePrice ?? 0,
      currencyCode: opts.currencyCode ?? catalog.currencyCode,
      status: opts.status ?? "draft",
      visibility: opts.visibility ?? "public",
      featured: opts.featured ?? false,
      moduleId: opts.moduleId ?? null,
      tags: opts.tags ?? [],
      customAttributes: (opts.customAttributes ?? {}) as Prisma.InputJsonValue,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
      ...(opts.kind === "service"
        ? {
            serviceDetail: {
              create: {
                tenantId: opts.tenantId,
                durationMinutes: opts.durationMinutes ?? null,
                bookable: opts.bookable ?? true,
                metadata: {},
              },
            },
          }
        : {}),
      ...(opts.kind === "product"
        ? {
            productDetail: {
              create: {
                tenantId: opts.tenantId,
                sku: opts.sku ?? opts.code,
                barcode: opts.barcode ?? null,
                unit: opts.unit ?? "each",
                weight: opts.weight ?? null,
                stockPlaceholder: opts.stockPlaceholder ?? null,
                metadata: {},
              },
            },
          }
        : {}),
      ...(opts.kind === "package"
        ? {
            packageDetail: {
              create: {
                tenantId: opts.tenantId,
                bundlePrice: opts.bundlePrice ?? opts.basePrice ?? null,
                validityDays: opts.validityDays ?? null,
                inheritAvailability: true,
                metadata: {},
              },
            },
          }
        : {}),
    },
    include: {
      serviceDetail: true,
      productDetail: true,
      packageDetail: true,
    },
  });

  if (opts.kind === "service" && opts.bookableResourceIds?.length) {
    for (const resourceId of opts.bookableResourceIds) {
      await prisma.availabilityLink.create({
        data: {
          tenantId: opts.tenantId,
          offeringId: offering.id,
          bookableResourceId: resourceId,
          quantity: 1,
          required: true,
        },
      });
    }
  }

  if (opts.kind === "package" && opts.packageItems?.length) {
    for (const [i, item] of opts.packageItems.entries()) {
      await prisma.packageItem.create({
        data: {
          tenantId: opts.tenantId,
          packageOfferingId: offering.id,
          childOfferingId: item.childOfferingId,
          quantity: item.quantity ?? 1,
          required: item.required ?? true,
          optional: item.optional ?? false,
          sortOrder: i,
        },
      });
    }
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "offering.created",
    resource: "offering",
    resourceId: offering.id,
    metadata: { kind: opts.kind, code: opts.code },
  });

  return offering;
}

function isWeekend(d: Date) {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export async function calculatePrice(opts: {
  tenantId: string;
  offeringId: string;
  quantity?: number;
  at?: Date;
  couponCode?: string | null;
  channelCode?: string | null;
  member?: boolean;
}): Promise<PriceQuote> {
  const quantity = opts.quantity ?? 1;
  const at = opts.at ?? new Date();
  const offering = await prisma.offering.findFirst({
    where: { id: opts.offeringId, tenantId: opts.tenantId },
    include: {
      pricingRules: { where: { status: "active" }, orderBy: { priority: "asc" } },
      packageDetail: true,
      packageItemsAsPkg: { include: { child: true } },
      discounts: { where: { status: "active" } },
    },
  });
  if (!offering) throw httpError("Offering not found", "not_found", 404);

  let unitPrice =
    offering.kind === "package" && offering.packageDetail?.bundlePrice != null
      ? offering.packageDetail.bundlePrice
      : offering.basePrice;

  const appliedRules: string[] = [];

  for (const rule of offering.pricingRules) {
    if (rule.startsAt && at < rule.startsAt) continue;
    if (rule.endsAt && at > rule.endsAt) continue;
    const days = Array.isArray(rule.daysOfWeek) ? (rule.daysOfWeek as number[]) : [];
    if (days.length && !days.includes(at.getUTCDay())) continue;

    if (rule.kind === "weekend" && !isWeekend(at)) continue;
    if (rule.kind === "member" && !opts.member) continue;
    if (rule.kind === "corporate") continue; // placeholder

    if (rule.percent != null) {
      unitPrice = unitPrice * (1 + rule.percent / 100);
      appliedRules.push(rule.code);
    } else if (rule.amount !== 0 || ["fixed", "hourly", "daily", "weekly", "monthly"].includes(rule.kind)) {
      if (["fixed", "hourly", "daily", "weekly", "monthly", "peak", "off_peak", "seasonal"].includes(rule.kind)) {
        unitPrice = rule.amount;
        appliedRules.push(rule.code);
      }
    }
  }

  // Package composition fallback: sum children if no bundle price
  if (
    offering.kind === "package" &&
    offering.packageDetail?.bundlePrice == null &&
    offering.packageItemsAsPkg.length
  ) {
    unitPrice = offering.packageItemsAsPkg.reduce(
      (sum, item) => sum + item.child.basePrice * item.quantity,
      0,
    );
    appliedRules.push("package_sum");
  }

  let subtotal = unitPrice * quantity;
  let discountAmount = 0;
  const appliedPromotions: string[] = [];

  // Offering-level discounts
  for (const d of offering.discounts) {
    if (d.percent != null) discountAmount += subtotal * (d.percent / 100);
    else discountAmount += d.amount * quantity;
    appliedPromotions.push(`discount:${d.name}`);
  }

  // Auto promotions
  const autos = await prisma.promotion.findMany({
    where: {
      tenantId: opts.tenantId,
      status: "active",
      kind: { in: ["auto", "flash", "happy_hour", "bundle"] },
    },
  });
  for (const promo of autos) {
    if (promo.startsAt && at < promo.startsAt) continue;
    if (promo.endsAt && at > promo.endsAt) continue;
    if (promo.percent != null) discountAmount += subtotal * (promo.percent / 100);
    else discountAmount += promo.amount;
    appliedPromotions.push(promo.code);
    if (!promo.stackable) break;
  }

  // Coupon
  let couponCode: string | null = null;
  if (opts.couponCode) {
    const couponResult = await validateCoupon({
      tenantId: opts.tenantId,
      code: opts.couponCode,
      at,
    });
    const promo = couponResult.promotion;
    const couponDiscount =
      promo.percent != null ? subtotal * (promo.percent / 100) : promo.amount;
    if (!promo.stackable && appliedPromotions.length) {
      // basic stacking: replace prior promo discounts if non-stackable coupon wins? keep both only if stackable
      discountAmount = couponDiscount;
      appliedPromotions.length = 0;
    } else {
      discountAmount += couponDiscount;
    }
    appliedPromotions.push(`coupon:${couponResult.coupon.code}`);
    couponCode = couponResult.coupon.code;
  }

  discountAmount = Math.min(discountAmount, subtotal);
  const afterDiscount = subtotal - discountAmount;

  const tax = await prisma.taxRule.findFirst({
    where: { tenantId: opts.tenantId, status: "active" },
  });
  let taxAmount = 0;
  if (tax && tax.ratePercent > 0 && !tax.inclusive) {
    taxAmount = afterDiscount * (tax.ratePercent / 100);
  }

  return {
    offeringId: offering.id,
    basePrice: offering.basePrice,
    unitPrice,
    quantity,
    subtotal,
    discountAmount,
    taxAmount,
    total: afterDiscount + taxAmount,
    currencyCode: offering.currencyCode,
    appliedRules,
    appliedPromotions,
    couponCode,
  };
}

export async function validateCoupon(opts: {
  tenantId: string;
  code: string;
  at?: Date;
}) {
  const at = opts.at ?? new Date();
  const coupon = await prisma.coupon.findFirst({
    where: { tenantId: opts.tenantId, code: opts.code.toUpperCase() },
    include: { promotion: true },
  });
  if (!coupon || coupon.status !== "active") {
    throw httpError("Invalid coupon code", "invalid_coupon", 400);
  }
  if (coupon.startsAt && at < coupon.startsAt) {
    throw httpError("Coupon not yet valid", "invalid_coupon", 400);
  }
  if (coupon.endsAt && at > coupon.endsAt) {
    throw httpError("Coupon expired", "invalid_coupon", 400);
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    throw httpError("Coupon fully redeemed", "invalid_coupon", 400);
  }

  let promotion = coupon.promotion;
  if (!promotion) {
    promotion = await prisma.promotion.findFirst({
      where: { tenantId: opts.tenantId, code: coupon.code, status: "active" },
    });
  }
  if (!promotion || promotion.status !== "active") {
    throw httpError("Coupon has no active promotion", "invalid_coupon", 400);
  }
  if (promotion.startsAt && at < promotion.startsAt) {
    throw httpError("Promotion not yet valid", "invalid_coupon", 400);
  }
  if (promotion.endsAt && at > promotion.endsAt) {
    throw httpError("Promotion expired", "invalid_coupon", 400);
  }

  return { coupon, promotion };
}

/** Book a service offering via Booking Engine using AvailabilityLinks. */
export async function bookServiceOffering(opts: {
  tenantId: string;
  offeringId: string;
  customerId?: string | null;
  startsAt: Date;
  endsAt: Date;
  partySize?: number;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const offering = await prisma.offering.findFirst({
    where: { id: opts.offeringId, tenantId: opts.tenantId },
    include: { serviceDetail: true, availabilityLinks: true },
  });
  if (!offering) throw httpError("Offering not found", "not_found", 404);
  if (offering.kind !== "service") {
    throw httpError("Only services can be booked", "invalid_kind", 400);
  }
  if (offering.serviceDetail && !offering.serviceDetail.bookable) {
    throw httpError("Service is not bookable", "not_bookable", 409);
  }
  if (!offering.availabilityLinks.length) {
    throw httpError("Service has no linked bookable resources", "no_resources", 409);
  }

  for (const link of offering.availabilityLinks) {
    const avail = await checkAvailability({
      tenantId: opts.tenantId,
      resourceId: link.bookableResourceId,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      quantity: link.quantity,
    });
    if (!avail.available) {
      const failed = avail as { message?: string; error?: string };
      throw httpError(
        failed.message ?? "Resource unavailable",
        failed.error ?? "unavailable",
        409,
      );
    }
  }

  const booking = await createBooking({
    tenantId: opts.tenantId,
    moduleId: offering.moduleId ?? "events",
    customerId: opts.customerId,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    partySize: opts.partySize,
    notes: opts.notes,
    status: "confirmed",
    items: offering.availabilityLinks.map((l) => ({
      resourceId: l.bookableResourceId,
      quantity: l.quantity,
    })),
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    skipPolicy: false,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "offering.booked",
    resource: "offering",
    resourceId: offering.id,
    metadata: { bookingId: booking.id },
  });

  return { booking, offering, quote: await calculatePrice({ tenantId: opts.tenantId, offeringId: offering.id }) };
}

export function mapOfferingPublic(
  o: {
    id: string;
    tenantId: string;
    catalogId: string;
    categoryId: string | null;
    kind: string;
    name: string;
    code: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    status: string;
    visibility: string;
    featured: boolean;
    basePrice: number;
    currencyCode: string;
    moduleId: string | null;
    tags: unknown;
    media?: Array<{ id: string; url: string; isCover: boolean; altText: string | null }>;
  },
  computedPrice?: number,
) {
  return {
    id: o.id,
    tenantId: o.tenantId,
    catalogId: o.catalogId,
    categoryId: o.categoryId,
    kind: o.kind,
    name: o.name,
    code: o.code,
    slug: o.slug,
    description: o.description,
    shortDescription: o.shortDescription,
    status: o.status,
    visibility: o.visibility,
    featured: o.featured,
    basePrice: o.basePrice,
    currencyCode: o.currencyCode,
    moduleId: o.moduleId,
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : [],
    computedPrice,
    media: o.media?.map((m) => ({
      id: m.id,
      url: m.url,
      isCover: m.isCover,
      altText: m.altText,
    })),
  };
}
