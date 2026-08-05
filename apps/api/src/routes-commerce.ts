import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  OFFERING_KINDS,
  OFFERING_RELATION_KINDS,
  OFFERING_STATUSES,
  OFFERING_VISIBILITY,
  PRICING_RULE_KINDS,
  PROMOTION_KINDS,
} from "@hospitalityos/shared";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  assertSameTenant,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { prisma } from "./db.js";
import { writeAudit } from "./lib/audit.js";
import {
  bookServiceOffering,
  calculatePrice,
  createOffering,
  ensureDefaultCatalog,
  listOfferings,
  mapOfferingPublic,
  validateCoupon,
} from "./services/commerce-engine.js";

export async function registerCommerceRoutes(app: FastifyInstance) {
  const staffAny = requireStaff;
  const staffManage = await requireStaffRoles([
    "owner",
    "admin",
    "manager",
    "front_desk",
    "operations",
  ]);
  const staffAdmin = await requireStaffRoles(["owner", "admin", "manager"]);

  app.post("/commerce/bootstrap", { preHandler: staffAny }, async (req) => {
    const catalog = await ensureDefaultCatalog(req.tenantId!);
    const categories = await prisma.catalogCategory.findMany({
      where: { tenantId: req.tenantId!, catalogId: catalog.id },
      orderBy: { sortOrder: "asc" },
    });
    const channels = await prisma.salesChannel.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { catalog, categories, channels };
  });

  app.get("/commerce/catalog", { preHandler: staffAny }, async (req) => {
    const catalog = await ensureDefaultCatalog(req.tenantId!);
    return { catalog };
  });

  // Categories
  app.get("/commerce/categories", { preHandler: staffAny }, async (req) => {
    const catalog = await ensureDefaultCatalog(req.tenantId!);
    const categories = await prisma.catalogCategory.findMany({
      where: { tenantId: req.tenantId!, catalogId: catalog.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { categories };
  });

  app.post("/commerce/categories", { preHandler: staffAdmin }, async (req) => {
    const catalog = await ensureDefaultCatalog(req.tenantId!);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        parentId: z.string().optional(),
        description: z.string().optional(),
        featured: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const slug = body.code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const category = await prisma.catalogCategory.create({
      data: {
        tenantId: req.tenantId!,
        catalogId: catalog.id,
        name: body.name,
        code: body.code,
        slug,
        parentId: body.parentId,
        description: body.description,
        featured: body.featured ?? false,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "category.created",
      resource: "catalog_category",
      resourceId: category.id,
    });
    return { category };
  });

  // Offerings list / create
  app.get("/commerce/offerings", { preHandler: staffAny }, async (req) => {
    const q = req.query as {
      kind?: string;
      categoryId?: string;
      status?: string;
      q?: string;
      featured?: string;
    };
    const offerings = await listOfferings({
      tenantId: req.tenantId!,
      kind: q.kind,
      categoryId: q.categoryId,
      status: q.status,
      q: q.q,
      featured: q.featured === "true" ? true : q.featured === "false" ? false : undefined,
    });
    return { offerings: offerings.map((o) => mapOfferingPublic(o)) };
  });

  app.get("/commerce/offerings/:id", { preHandler: staffAny }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const offering = await prisma.offering.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: {
        media: true,
        serviceDetail: true,
        productDetail: true,
        packageDetail: true,
        packageItemsAsPkg: { include: { child: true } },
        availabilityLinks: true,
        addons: true,
        relationsFrom: true,
        pricingRules: true,
        variants: true,
        optionGroups: { include: { options: true } },
      },
    });
    if (!offering) return tenantNotFound(reply);
    const quote = await calculatePrice({ tenantId: req.tenantId!, offeringId: id });
    return { offering, quote };
  });

  app.post("/commerce/offerings", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        kind: z.enum(OFFERING_KINDS),
        name: z.string().min(1),
        code: z.string().min(1),
        categoryId: z.string().optional(),
        description: z.string().optional(),
        shortDescription: z.string().optional(),
        basePrice: z.number().nonnegative().optional(),
        status: z.enum(OFFERING_STATUSES).optional(),
        visibility: z.enum(OFFERING_VISIBILITY).optional(),
        featured: z.boolean().optional(),
        moduleId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        durationMinutes: z.number().int().positive().optional(),
        bookable: z.boolean().optional(),
        bookableResourceIds: z.array(z.string()).optional(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        unit: z.string().optional(),
        weight: z.number().optional(),
        stockPlaceholder: z.number().int().optional(),
        bundlePrice: z.number().optional(),
        validityDays: z.number().int().optional(),
        packageItems: z
          .array(
            z.object({
              childOfferingId: z.string(),
              quantity: z.number().int().positive().optional(),
              required: z.boolean().optional(),
              optional: z.boolean().optional(),
            }),
          )
          .optional(),
      })
      .parse(req.body);

    try {
      const offering = await createOffering({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { offering: mapOfferingPublic(offering) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.patch("/commerce/offerings/:id", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.offering.findUnique({ where: { id } });
    if (!existing || !assertSameTenant(existing.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        shortDescription: z.string().nullable().optional(),
        basePrice: z.number().nonnegative().optional(),
        status: z.enum(OFFERING_STATUSES).optional(),
        visibility: z.enum(OFFERING_VISIBILITY).optional(),
        featured: z.boolean().optional(),
        categoryId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);

    const offering = await prisma.offering.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        shortDescription: body.shortDescription,
        basePrice: body.basePrice,
        status: body.status,
        visibility: body.visibility,
        featured: body.featured,
        categoryId: body.categoryId,
        sortOrder: body.sortOrder,
        ...(body.tags ? { tags: body.tags } : {}),
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "offering.updated",
      resource: "offering",
      resourceId: offering.id,
      metadata: body,
    });
    return { offering: mapOfferingPublic(offering) };
  });

  // Convenience filtered lists
  app.get("/commerce/services", { preHandler: staffAny }, async (req) => {
    const offerings = await listOfferings({ tenantId: req.tenantId!, kind: "service" });
    return { services: offerings.map((o) => mapOfferingPublic(o)) };
  });
  app.get("/commerce/products", { preHandler: staffAny }, async (req) => {
    const offerings = await listOfferings({ tenantId: req.tenantId!, kind: "product" });
    return { products: offerings.map((o) => mapOfferingPublic(o)) };
  });
  app.get("/commerce/packages", { preHandler: staffAny }, async (req) => {
    const offerings = await listOfferings({ tenantId: req.tenantId!, kind: "package" });
    return { packages: offerings.map((o) => mapOfferingPublic(o)) };
  });

  // Pricing
  app.post("/commerce/pricing/quote", { preHandler: staffAny }, async (req, reply) => {
    const body = z
      .object({
        offeringId: z.string(),
        quantity: z.number().int().positive().optional(),
        couponCode: z.string().optional(),
        at: z.string().optional(),
        member: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const quote = await calculatePrice({
        tenantId: req.tenantId!,
        offeringId: body.offeringId,
        quantity: body.quantity,
        couponCode: body.couponCode,
        at: body.at ? new Date(body.at) : undefined,
        member: body.member,
      });
      return { quote };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/commerce/pricing-rules", { preHandler: staffAny }, async (req) => {
    const rules = await prisma.pricingRule.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { priority: "asc" },
    });
    return { rules };
  });

  app.post("/commerce/pricing-rules", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        kind: z.enum(PRICING_RULE_KINDS),
        amount: z.number().optional(),
        percent: z.number().optional(),
        offeringId: z.string().optional(),
        priority: z.number().int().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        daysOfWeek: z.array(z.number().int()).optional(),
      })
      .parse(req.body);
    const rule = await prisma.pricingRule.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        kind: body.kind,
        amount: body.amount ?? 0,
        percent: body.percent,
        offeringId: body.offeringId,
        priority: body.priority ?? 100,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        daysOfWeek: body.daysOfWeek ?? [],
        config: {},
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "pricing_rule.created",
      resource: "pricing_rule",
      resourceId: rule.id,
    });
    return { rule };
  });

  // Promotions & coupons
  app.get("/commerce/promotions", { preHandler: staffAny }, async (req) => {
    const promotions = await prisma.promotion.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
    });
    return { promotions };
  });

  app.post("/commerce/promotions", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        kind: z.enum(PROMOTION_KINDS),
        amount: z.number().optional(),
        percent: z.number().optional(),
        stackable: z.boolean().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
      })
      .parse(req.body);
    const promotion = await prisma.promotion.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code.toUpperCase(),
        kind: body.kind,
        amount: body.amount ?? 0,
        percent: body.percent,
        stackable: body.stackable ?? false,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        channelIds: [],
        config: {},
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "promotion.created",
      resource: "promotion",
      resourceId: promotion.id,
    });
    return { promotion };
  });

  app.get("/commerce/coupons", { preHandler: staffAny }, async (req) => {
    const coupons = await prisma.coupon.findMany({
      where: { tenantId: req.tenantId! },
      include: { promotion: true },
      orderBy: { createdAt: "desc" },
    });
    return { coupons };
  });

  app.post("/commerce/coupons", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        code: z.string().min(1),
        promotionId: z.string().optional(),
        maxRedemptions: z.number().int().positive().optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
      })
      .parse(req.body);
    const coupon = await prisma.coupon.create({
      data: {
        tenantId: req.tenantId!,
        code: body.code.toUpperCase(),
        promotionId: body.promotionId,
        maxRedemptions: body.maxRedemptions,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "coupon.created",
      resource: "coupon",
      resourceId: coupon.id,
    });
    return { coupon };
  });

  app.post("/commerce/coupons/validate", { preHandler: staffAny }, async (req, reply) => {
    const body = z.object({ code: z.string().min(1) }).parse(req.body);
    try {
      const result = await validateCoupon({ tenantId: req.tenantId!, code: body.code });
      return {
        valid: true,
        coupon: result.coupon,
        promotion: result.promotion,
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message, valid: false });
    }
  });

  // Media
  app.get("/commerce/media", { preHandler: staffAny }, async (req) => {
    const q = req.query as { offeringId?: string };
    const media = await prisma.mediaAsset.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.offeringId ? { offeringId: q.offeringId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
    return { media };
  });

  app.post("/commerce/media", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        url: z.string().url(),
        offeringId: z.string().optional(),
        kind: z.string().optional(),
        altText: z.string().optional(),
        isCover: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const media = await prisma.mediaAsset.create({
      data: {
        tenantId: req.tenantId!,
        url: body.url,
        offeringId: body.offeringId,
        kind: body.kind ?? "image",
        altText: body.altText,
        isCover: body.isCover ?? false,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "media.created",
      resource: "media_asset",
      resourceId: media.id,
    });
    return { media };
  });

  // Add-ons
  app.get("/commerce/addons", { preHandler: staffAny }, async (req) => {
    const q = req.query as { offeringId?: string };
    const addons = await prisma.addon.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.offeringId ? { offeringId: q.offeringId } : {}),
      },
      orderBy: { name: "asc" },
    });
    return { addons };
  });

  app.post("/commerce/addons", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        price: z.number().nonnegative().default(0),
        offeringId: z.string().optional(),
        addonOfferingId: z.string().optional(),
        required: z.boolean().optional(),
        maxQuantity: z.number().int().positive().optional(),
      })
      .parse(req.body);
    const addon = await prisma.addon.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        price: body.price,
        offeringId: body.offeringId,
        addonOfferingId: body.addonOfferingId,
        required: body.required ?? false,
        maxQuantity: body.maxQuantity ?? 1,
        status: "active",
      },
    });
    return { addon };
  });

  // Upsells / cross-sells
  app.get("/commerce/relations", { preHandler: staffAny }, async (req) => {
    const q = req.query as { offeringId?: string; kind?: string };
    const relations = await prisma.offeringRelation.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.offeringId ? { offeringId: q.offeringId } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
      },
      include: { related: true },
      orderBy: { sortOrder: "asc" },
    });
    return { relations };
  });

  app.post("/commerce/relations", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        offeringId: z.string(),
        relatedOfferingId: z.string(),
        kind: z.enum(OFFERING_RELATION_KINDS),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const relation = await prisma.offeringRelation.create({
      data: {
        tenantId: req.tenantId!,
        offeringId: body.offeringId,
        relatedOfferingId: body.relatedOfferingId,
        kind: body.kind,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return { relation };
  });

  // Sales channels
  app.get("/commerce/channels", { preHandler: staffAny }, async (req) => {
    await ensureDefaultCatalog(req.tenantId!);
    const channels = await prisma.salesChannel.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { channels };
  });

  // Book service via commerce
  app.post("/commerce/services/:id/book", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        startsAt: z.string(),
        endsAt: z.string(),
        customerId: z.string().optional(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookServiceOffering({
        tenantId: req.tenantId!,
        offeringId: id,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/commerce/audit-events", { preHandler: staffAdmin }, async (req) => {
    const events = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId!,
        resource: {
          in: [
            "offering",
            "catalog_category",
            "pricing_rule",
            "promotion",
            "coupon",
            "media_asset",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { events };
  });

  // ── Guest surfaces ───────────────────────────────────────────
  const guestPre = requireGuest;

  app.get("/guest/commerce/catalog", { preHandler: guestPre }, async (req) => {
    const catalog = await ensureDefaultCatalog(req.tenantId!);
    const categories = await prisma.catalogCategory.findMany({
      where: { tenantId: req.tenantId!, catalogId: catalog.id, status: "active" },
      orderBy: { sortOrder: "asc" },
    });
    return { catalog: { id: catalog.id, name: catalog.name, currencyCode: catalog.currencyCode }, categories };
  });

  app.get("/guest/commerce/offerings", { preHandler: guestPre }, async (req) => {
    const q = req.query as { kind?: string; categoryId?: string; q?: string; featured?: string };
    const offerings = await listOfferings({
      tenantId: req.tenantId!,
      kind: q.kind,
      categoryId: q.categoryId,
      q: q.q,
      featured: q.featured === "true" ? true : undefined,
      guestFacing: true,
    });
    const withPrices = await Promise.all(
      offerings.map(async (o) => {
        const quote = await calculatePrice({ tenantId: req.tenantId!, offeringId: o.id });
        return mapOfferingPublic(o, quote.total);
      }),
    );
    return { offerings: withPrices };
  });

  app.get("/guest/commerce/offerings/:id", { preHandler: guestPre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const offering = await prisma.offering.findFirst({
      where: {
        id,
        tenantId: req.tenantId!,
        status: { in: ["active", "featured"] },
        visibility: "public",
      },
      include: {
        media: true,
        serviceDetail: true,
        productDetail: true,
        packageDetail: true,
        packageItemsAsPkg: { include: { child: true } },
        addons: true,
        relationsFrom: { include: { related: true } },
        availabilityLinks: true,
      },
    });
    if (!offering) return tenantNotFound(reply);
    const quote = await calculatePrice({ tenantId: req.tenantId!, offeringId: id });
    return { offering, quote };
  });

  app.post("/guest/commerce/pricing/quote", { preHandler: guestPre }, async (req, reply) => {
    const body = z
      .object({
        offeringId: z.string(),
        quantity: z.number().int().positive().optional(),
        couponCode: z.string().optional(),
      })
      .parse(req.body);
    try {
      const quote = await calculatePrice({
        tenantId: req.tenantId!,
        offeringId: body.offeringId,
        quantity: body.quantity,
        couponCode: body.couponCode,
      });
      return { quote };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/guest/commerce/coupons/validate", { preHandler: guestPre }, async (req, reply) => {
    const body = z.object({ code: z.string().min(1) }).parse(req.body);
    try {
      const result = await validateCoupon({ tenantId: req.tenantId!, code: body.code });
      return {
        valid: true,
        code: result.coupon.code,
        kind: result.promotion.kind,
        amount: result.promotion.amount,
        percent: result.promotion.percent,
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        valid: false,
      });
    }
  });

  app.post("/guest/commerce/services/:id/book", { preHandler: guestPre }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
        couponCode: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookServiceOffering({
        tenantId: req.tenantId!,
        offeringId: id,
        customerId: auth.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      let quote = result.quote;
      if (body.couponCode) {
        quote = await calculatePrice({
          tenantId: req.tenantId!,
          offeringId: id,
          couponCode: body.couponCode,
        });
      }
      return { booking: result.booking, quote };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });
}
