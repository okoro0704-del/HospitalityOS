import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CRM_NOTE_VISIBILITIES,
  CRM_CONSENT_STATUSES,
  CRM_INTERACTION_TYPES,
  CRM_FEEDBACK_STATUSES,
  LOYALTY_STATUSES,
} from "@hospitalityos/shared";
import { prisma } from "./db.js";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  assertSameTenant,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireCrmModule } from "./lib/module-gate.js";
import { writeAudit } from "./lib/audit.js";
import { toCustomerPublic } from "./lib/mappers.js";
import {
  canReadInternalNotes,
  collectVerticalTimeline,
  ensureLoyaltyProfile,
  evaluateSegment,
  mergeCustomers,
  recordCustomerEvent,
  searchCustomers,
  setCustomerPreference,
  updateCustomerProfile,
} from "./services/crm.js";

function mapErr(err: unknown) {
  const e = err as { statusCode?: number; code?: string; message?: string };
  return {
    status: e.statusCode ?? 500,
    body: { error: e.code ?? "internal_error", message: e.message ?? "Unexpected error" },
  };
}

async function crmPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireCrmModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireCrmModule(req, reply);
  };
}

export async function registerCrmRoutes(app: FastifyInstance) {
  const staffBasic = requireStaff;
  const staffCrm = await crmPre();
  const staffCrmWrite = await crmPre([
    "owner",
    "admin",
    "manager",
    "crm_manager",
    "front_desk",
    "reception",
  ]);
  const staffCrmAdmin = await crmPre(["owner", "admin", "manager", "crm_manager"]);
  const staffNotes = await crmPre([
    "owner",
    "admin",
    "manager",
    "crm_manager",
    "front_desk",
    "reception",
  ]);

  /* Basic customer CRUD — ungated for platform compatibility */
  app.get("/customers", { preHandler: staffBasic }, async (req) => {
    const q = (req.query as { q?: string; tag?: string }).q;
    const tag = (req.query as { tag?: string }).tag;
    if (q || tag) {
      const customers = await searchCustomers({
        tenantId: req.tenantId!,
        q,
        tagCode: tag,
      });
      return { customers: customers.map(toCustomerPublic) };
    }
    const customers = await prisma.customer.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
    });
    return { customers: customers.map(toCustomerPublic) };
  });

  app.get("/search/customers", { preHandler: staffBasic }, async (req) => {
    const q = z.object({ q: z.string().optional(), tag: z.string().optional() }).parse(req.query);
    const customers = await searchCustomers({
      tenantId: req.tenantId!,
      q: q.q,
      tagCode: q.tag,
    });
    return { customers: customers.map(toCustomerPublic) };
  });

  app.get("/customers/:id", { preHandler: staffBasic }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        crmTagLinks: { include: { tag: true } },
        crmLoyalty: true,
        crmCommPrefs: true,
      },
    });
    if (!customer || !assertSameTenant(customer.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    return {
      customer: toCustomerPublic(customer),
      tags: customer.crmTagLinks.map((l) => l.tag),
      loyalty: customer.crmLoyalty,
      communicationPreferences: customer.crmCommPrefs,
    };
  });

  app.post("/customers", {
    preHandler: await requireStaffRoles(["owner", "admin", "manager", "front_desk", "crm_manager"]),
  }, async (req) => {
    const body = z
      .object({
        displayName: z.string().min(1),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        externalIdentityRef: z.string().optional(),
        trustId: z.string().optional(),
      })
      .parse(req.body);

    const customer = await prisma.customer.create({
      data: {
        tenantId: req.tenantId!,
        displayName: body.displayName,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        externalIdentityRef: body.externalIdentityRef,
        trustId: body.trustId,
        preferences: {},
        loyaltyPlaceholder: {},
        metadata: {},
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "customer.created",
      resource: "customer",
      resourceId: customer.id,
    });
    return { customer: toCustomerPublic(customer) };
  });

  app.patch("/customers/:id", { preHandler: staffCrmWrite }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        displayName: z.string().min(1).optional(),
        firstName: z.string().nullable().optional(),
        lastName: z.string().nullable().optional(),
        preferredName: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        preferredLanguage: z.string().nullable().optional(),
        timezone: z.string().nullable().optional(),
        externalIdentityRef: z.string().nullable().optional(),
        trustId: z.string().nullable().optional(),
        status: z.enum(["active", "blocked", "inactive"]).optional(),
        preferences: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    try {
      const customer = await updateCustomerProfile({
        tenantId: req.tenantId!,
        customerId: id,
        data: body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { customer: toCustomerPublic(customer) };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/customers/:id/timeline", { preHandler: staffCrm }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!customer) return reply.code(404).send({ error: "not_found", message: "Customer not found" });
    const timeline = await collectVerticalTimeline({
      tenantId: req.tenantId!,
      customerId: id,
    });
    return { timeline };
  });

  app.get("/customers/:id/preferences", { preHandler: staffCrm }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const prefs = await prisma.customerPreference.findMany({
      where: { tenantId: req.tenantId!, customerId: id },
    });
    return { preferences: prefs };
  });

  app.post("/customers/:id/preferences", { preHandler: staffCrmWrite }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        moduleId: z.string().optional(),
        key: z.string().min(1),
        value: z.unknown(),
      })
      .parse(req.body);
    try {
      const preference = await setCustomerPreference({
        tenantId: req.tenantId!,
        customerId: id,
        moduleId: body.moduleId,
        key: body.key,
        value: body.value,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ preference });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/customers/:id/tags", { preHandler: staffCrm }, async (req) => {
    const { id } = req.params as { id: string };
    const links = await prisma.customerTagLink.findMany({
      where: { tenantId: req.tenantId!, customerId: id },
      include: { tag: true },
    });
    return { tags: links.map((l) => l.tag) };
  });

  app.post("/customers/:id/tags", { preHandler: staffCrmWrite }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ tagId: z.string().min(1) }).parse(req.body);
    const link = await prisma.customerTagLink.create({
      data: { tenantId: req.tenantId!, customerId: id, tagId: body.tagId },
      include: { tag: true },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "customer.tag.added",
      resource: "customer_tag_link",
      resourceId: link.id,
    });
    return reply.code(201).send({ tag: link.tag });
  });

  app.get("/customers/:id/notes", { preHandler: staffNotes }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const role = (req.auth as StaffAuth).role;
    if (!canReadInternalNotes(role)) {
      return reply.code(403).send({ error: "forbidden", message: "Cannot read internal notes" });
    }
    const notes = await prisma.customerNote.findMany({
      where: { tenantId: req.tenantId!, customerId: id },
      orderBy: { createdAt: "desc" },
    });
    return { notes };
  });

  app.post("/customers/:id/notes", { preHandler: staffNotes }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        body: z.string().min(1),
        visibility: z.enum(CRM_NOTE_VISIBILITIES).optional(),
      })
      .parse(req.body);
    const note = await prisma.customerNote.create({
      data: {
        tenantId: req.tenantId!,
        customerId: id,
        body: body.body,
        visibility: body.visibility ?? "internal",
        authorId: (req.auth as StaffAuth).staffId,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "customer.note.created",
      resource: "customer_note",
      resourceId: note.id,
    });
    return reply.code(201).send({ note });
  });

  app.get("/customers/:id/consent", { preHandler: staffCrm }, async (req) => {
    const { id } = req.params as { id: string };
    const consents = await prisma.customerConsent.findMany({
      where: { tenantId: req.tenantId!, customerId: id },
    });
    return { consents };
  });

  app.post("/customers/:id/consent", { preHandler: staffCrmWrite }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        purpose: z.string().min(1),
        status: z.enum(CRM_CONSENT_STATUSES),
        source: z.string().optional(),
        policyRef: z.string().optional(),
      })
      .parse(req.body);
    const consent = await prisma.customerConsent.create({
      data: {
        tenantId: req.tenantId!,
        customerId: id,
        purpose: body.purpose,
        status: body.status,
        source: body.source ?? null,
        policyRef: body.policyRef ?? null,
        grantedAt: body.status === "granted" ? new Date() : null,
        withdrawnAt: body.status === "withdrawn" ? new Date() : null,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "customer.consent.updated",
      resource: "customer_consent",
      resourceId: consent.id,
    });
    return reply.code(201).send({ consent });
  });

  app.get("/customers/:id/interactions", { preHandler: staffCrm }, async (req) => {
    const { id } = req.params as { id: string };
    const interactions = await prisma.customerInteraction.findMany({
      where: { tenantId: req.tenantId!, customerId: id },
      orderBy: { occurredAt: "desc" },
    });
    return { interactions };
  });

  app.post("/customers/:id/interactions", { preHandler: staffCrmWrite }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        type: z.enum(CRM_INTERACTION_TYPES).optional(),
        notes: z.string().optional(),
        relatedType: z.string().optional(),
        relatedId: z.string().optional(),
        followUpAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const interaction = await prisma.customerInteraction.create({
      data: {
        tenantId: req.tenantId!,
        customerId: id,
        type: body.type ?? "general",
        notes: body.notes ?? null,
        relatedType: body.relatedType ?? null,
        relatedId: body.relatedId ?? null,
        followUpAt: body.followUpAt ? new Date(body.followUpAt) : null,
        staffId: (req.auth as StaffAuth).staffId,
      },
    });
    await recordCustomerEvent({
      tenantId: req.tenantId!,
      customerId: id,
      eventType: "INTERACTION",
      sourceModule: "customer_management",
      sourceEntityId: interaction.id,
      title: `Interaction: ${interaction.type}`,
    });
    return reply.code(201).send({ interaction });
  });

  app.get("/customers/:id/feedback", { preHandler: staffCrm }, async (req) => {
    const { id } = req.params as { id: string };
    const feedback = await prisma.customerFeedback.findMany({
      where: { tenantId: req.tenantId!, customerId: id },
      orderBy: { createdAt: "desc" },
    });
    return { feedback };
  });

  app.post("/customers/:id/feedback", { preHandler: staffCrmWrite }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
        source: z.string().optional(),
        sourceModule: z.string().optional(),
        sourceEntityId: z.string().optional(),
      })
      .parse(req.body);
    const feedback = await prisma.customerFeedback.create({
      data: {
        tenantId: req.tenantId!,
        customerId: id,
        rating: body.rating,
        comment: body.comment ?? null,
        source: body.source ?? null,
        sourceModule: body.sourceModule ?? null,
        sourceEntityId: body.sourceEntityId ?? null,
        status: "new",
      },
    });
    await recordCustomerEvent({
      tenantId: req.tenantId!,
      customerId: id,
      eventType: "FEEDBACK",
      sourceModule: body.sourceModule ?? "customer_management",
      sourceEntityId: feedback.id,
      title: `Feedback ${body.rating}/5`,
    });
    return reply.code(201).send({ feedback });
  });

  app.get("/customers/:id/loyalty", { preHandler: staffCrm }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const loyalty = await ensureLoyaltyProfile({
        tenantId: req.tenantId!,
        customerId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { loyalty };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.patch("/customers/:id/loyalty", { preHandler: staffCrmAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum(LOYALTY_STATUSES).optional(),
        tier: z.string().nullable().optional(),
        pointsBalance: z.number().int().optional(),
        enroll: z.boolean().optional(),
      })
      .parse(req.body);
    await ensureLoyaltyProfile({
      tenantId: req.tenantId!,
      customerId: id,
      enroll: body.enroll,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
    });
    const loyalty = await prisma.customerLoyaltyProfile.update({
      where: { customerId: id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.tier !== undefined ? { tier: body.tier } : {}),
        ...(body.pointsBalance !== undefined ? { pointsBalance: body.pointsBalance } : {}),
        ...(body.enroll ? { enrolledAt: new Date(), status: "enrolled" } : {}),
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "customer.loyalty.updated",
      resource: "customer_loyalty_profile",
      resourceId: loyalty.id,
    });
    return { loyalty };
  });

  /* Tags & segments */
  app.get("/tags", { preHandler: staffCrm }, async (req) => {
    const tags = await prisma.customerTag.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { tags };
  });

  app.post("/tags", { preHandler: staffCrmAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        color: z.string().optional(),
        description: z.string().optional(),
      })
      .parse(req.body);
    const tag = await prisma.customerTag.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        color: body.color ?? null,
        description: body.description ?? null,
      },
    });
    return reply.code(201).send({ tag });
  });

  app.get("/segments", { preHandler: staffCrm }, async (req) => {
    const segments = await prisma.customerSegment.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { segments };
  });

  app.post("/segments", { preHandler: staffCrmAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        rules: z.record(z.unknown()).default({}),
      })
      .parse(req.body);
    const segment = await prisma.customerSegment.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description ?? null,
        rules: body.rules as object,
      },
    });
    return reply.code(201).send({ segment });
  });

  app.get("/segments/:id/members", { preHandler: staffCrm }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await evaluateSegment({ tenantId: req.tenantId!, segmentId: id });
      return {
        segment: result.segment,
        customers: result.customers.map(toCustomerPublic),
      };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  /* Merge — API available, requires confirmed=true; Staff UI stays disabled */
  app.post("/customers/merge", { preHandler: staffCrmAdmin }, async (req, reply) => {
    const body = z
      .object({
        sourceCustomerId: z.string().min(1),
        destinationCustomerId: z.string().min(1),
        reason: z.string().optional(),
        confirmed: z.literal(true),
      })
      .parse(req.body);
    try {
      const result = await mergeCustomers({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { merge: result.request, destination: toCustomerPublic(result.destination) };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  /* Guest */
  app.get("/guest/customer", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const customer = await prisma.customer.findFirst({
      where: { id: auth.customerId, tenantId: auth.tenantId },
      include: { crmLoyalty: true, crmCommPrefs: true },
    });
    return {
      customer: customer ? toCustomerPublic(customer) : null,
      loyalty: customer?.crmLoyalty ?? null,
      communicationPreferences: customer?.crmCommPrefs ?? null,
    };
  });

  app.get("/guest/customer/timeline", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const timeline = await collectVerticalTimeline({
      tenantId: auth.tenantId,
      customerId: auth.customerId,
    });
    return { timeline };
  });

  app.get("/guest/customer/preferences", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const preferences = await prisma.customerPreference.findMany({
      where: { tenantId: auth.tenantId, customerId: auth.customerId },
    });
    return { preferences };
  });

  app.patch("/guest/customer/preferences", { preHandler: requireGuest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        moduleId: z.string().optional(),
        key: z.string().min(1),
        value: z.unknown(),
      })
      .parse(req.body);
    try {
      const preference = await setCustomerPreference({
        tenantId: auth.tenantId,
        customerId: auth.customerId,
        moduleId: body.moduleId,
        key: body.key,
        value: body.value,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { preference };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/guest/customer/feedback", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const feedback = await prisma.customerFeedback.findMany({
      where: { tenantId: auth.tenantId, customerId: auth.customerId },
      orderBy: { createdAt: "desc" },
    });
    return { feedback };
  });

  app.post("/guest/customer/feedback", { preHandler: requireGuest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
        sourceModule: z.string().optional(),
        sourceEntityId: z.string().optional(),
      })
      .parse(req.body);
    const feedback = await prisma.customerFeedback.create({
      data: {
        tenantId: auth.tenantId,
        customerId: auth.customerId,
        rating: body.rating,
        comment: body.comment ?? null,
        source: "guest",
        sourceModule: body.sourceModule ?? null,
        sourceEntityId: body.sourceEntityId ?? null,
        status: "new" satisfies (typeof CRM_FEEDBACK_STATUSES)[number],
      },
    });
    return reply.code(201).send({ feedback });
  });
}
