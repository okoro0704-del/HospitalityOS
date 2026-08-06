import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  staffHasBillingPermission,
  type BillingPermission,
  SUPPORTED_CURRENCIES,
} from "@hospitalityos/shared";
import { prisma } from "./db.js";
import {
  requireGuest,
  requireStaff,
  tenantNotFound,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireBillingModule } from "./lib/module-gate.js";
import {
  authorizeAndCapture,
  cancelPaymentIntent,
  createCreditNote,
  createInvoice,
  createPaymentIntent,
  createRefund,
  getBillingDashboard,
  processWebhook,
  recordCashPayment,
} from "./services/billing/engine.js";
import {
  billAccommodation,
  billCinema,
  billCommerce,
  billDining,
  billEvents,
  billFitness,
  billSpa,
} from "./services/billing/verticals.js";

function mapErr(err: unknown) {
  const e = err as { statusCode?: number; code?: string; message?: string };
  return {
    status: e.statusCode ?? 500,
    body: { error: e.code ?? "internal_error", message: e.message ?? "Unexpected error" },
  };
}

async function billingStaff(permission: BillingPermission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireBillingModule(req, reply);
    if (reply.sent) return;
    const auth = req.auth as StaffAuth;
    if (!staffHasBillingPermission(auth.role, permission)) {
      return reply.code(403).send({
        error: "forbidden",
        message: `Missing permission ${permission}`,
      });
    }
  };
}

export async function registerBillingRoutes(app: FastifyInstance) {
  const view = await billingStaff("billing.view");
  const create = await billingStaff("billing.create");
  const update = await billingStaff("billing.update");
  const refund = await billingStaff("billing.refund");
  const cash = await billingStaff("billing.cash");
  const taxPerm = await billingStaff("billing.tax");
  const settlement = await billingStaff("billing.settlement");
  const admin = await billingStaff("billing.admin");

  app.get("/billing/dashboard", { preHandler: view }, async (req) => {
    return { dashboard: await getBillingDashboard(req.tenantId!) };
  });

  app.get("/billing/invoices", { preHandler: view }, async (req) => {
    const q = req.query as { status?: string; customerId?: string };
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.status ? { status: q.status } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { lines: true },
    });
    return { invoices };
  });

  app.get("/billing/invoices/:id", { preHandler: view }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { lines: true, payments: true, receipts: true, creditNotes: true },
    });
    if (!invoice) return tenantNotFound(reply);
    return { invoice };
  });

  app.post("/billing/invoices", { preHandler: create }, async (req, reply) => {
    const body = z
      .object({
        customerId: z.string().min(1),
        currency: z.enum(SUPPORTED_CURRENCIES).default("NGN"),
        taxRuleCode: z.string().optional(),
        notes: z.string().optional(),
        lines: z
          .array(
            z.object({
              description: z.string().min(1),
              unitAmount: z.number().int(),
              quantity: z.number().int().positive().optional(),
              discountAmount: z.number().int().nonnegative().optional(),
              taxAmount: z.number().int().nonnegative().optional(),
              sourceModule: z.string().optional(),
              sourceEntityId: z.string().optional(),
              billableType: z.string().optional(),
            }),
          )
          .min(1),
      })
      .parse(req.body);
    try {
      const invoice = await createInvoice({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ invoice });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/billing/billable", { preHandler: create }, async (req, reply) => {
    const body = z
      .object({
        vertical: z.enum([
          "accommodation",
          "dining",
          "fitness",
          "spa",
          "events",
          "cinema",
          "commerce",
        ]),
        customerId: z.string().min(1),
        sourceEntityId: z.string().min(1),
        description: z.string().min(1),
        currency: z.enum(SUPPORTED_CURRENCIES).default("NGN"),
        unitAmount: z.number().int(),
        quantity: z.number().int().positive().optional(),
        discountAmount: z.number().int().nonnegative().optional(),
      })
      .parse(req.body);
    const common = {
      tenantId: req.tenantId!,
      customerId: body.customerId,
      sourceEntityId: body.sourceEntityId,
      description: body.description,
      currency: body.currency,
      unitAmount: body.unitAmount,
      quantity: body.quantity,
      discountAmount: body.discountAmount,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
    };
    const fn = {
      accommodation: billAccommodation,
      dining: billDining,
      fitness: billFitness,
      spa: billSpa,
      events: billEvents,
      cinema: billCinema,
      commerce: billCommerce,
    }[body.vertical];
    const item = await fn(common);
    return reply.code(201).send({ billableItem: item });
  });

  app.post("/billing/payment-intents", { preHandler: create }, async (req, reply) => {
    const body = z
      .object({
        invoiceId: z.string().min(1),
        amount: z.number().int().positive().optional(),
        idempotencyKey: z.string().min(1),
        scenario: z.string().optional(),
      })
      .parse(req.body);
    try {
      const intent = await createPaymentIntent({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ intent });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/billing/payment-intents/:id/capture", { preHandler: create }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ idempotencyKey: z.string().optional() }).parse(req.body ?? {});
    try {
      const result = await authorizeAndCapture({
        tenantId: req.tenantId!,
        intentId: id,
        idempotencyKey: body.idempotencyKey,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { ...result };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/billing/payment-intents/:id/cancel", { preHandler: update }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const intent = await cancelPaymentIntent({
        tenantId: req.tenantId!,
        intentId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { intent };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/billing/payments", { preHandler: view }, async (req) => {
    const payments = await prisma.payment.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { payments };
  });

  app.get("/billing/payments/:id", { preHandler: view }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const payment = await prisma.payment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { refunds: true, receipts: true },
    });
    if (!payment) return tenantNotFound(reply);
    return { payment };
  });

  app.post("/billing/payments/cash", { preHandler: cash }, async (req, reply) => {
    const body = z
      .object({
        invoiceId: z.string().min(1),
        amount: z.number().int().positive(),
        idempotencyKey: z.string().min(1),
      })
      .parse(req.body);
    try {
      const payment = await recordCashPayment({
        tenantId: req.tenantId!,
        invoiceId: body.invoiceId,
        amount: body.amount,
        staffId: (req.auth as StaffAuth).staffId,
        idempotencyKey: body.idempotencyKey,
      });
      return reply.code(201).send({ payment });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/billing/refunds", { preHandler: view }, async (req) => {
    const refunds = await prisma.refund.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { refunds };
  });

  app.post("/billing/refunds", { preHandler: refund }, async (req, reply) => {
    const body = z
      .object({
        paymentId: z.string().min(1),
        amount: z.number().int().positive(),
        reason: z.string().optional(),
        idempotencyKey: z.string().min(1),
      })
      .parse(req.body);
    try {
      const r = await createRefund({
        tenantId: req.tenantId!,
        ...body,
        staffId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ refund: r });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/billing/receipts", { preHandler: view }, async (req) => {
    const receipts = await prisma.receipt.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { receipts };
  });

  app.get("/billing/credit-notes", { preHandler: view }, async (req) => {
    const creditNotes = await prisma.creditNote.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { creditNotes };
  });

  app.post("/billing/credit-notes", { preHandler: update }, async (req, reply) => {
    const body = z
      .object({
        invoiceId: z.string().min(1),
        amount: z.number().int().positive(),
        reason: z.string().optional(),
      })
      .parse(req.body);
    try {
      const note = await createCreditNote({
        tenantId: req.tenantId!,
        ...body,
        staffId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ creditNote: note });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/billing/payment-methods", { preHandler: view }, async (req) => {
    const methods = await prisma.paymentMethod.findMany({
      where: { tenantId: req.tenantId! },
      take: 50,
    });
    return { paymentMethods: methods };
  });

  app.get("/billing/taxes", { preHandler: view }, async (req) => {
    const rules = await prisma.billingTaxRule.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { code: "asc" },
    });
    return { taxRules: rules };
  });

  app.post("/billing/taxes", { preHandler: taxPerm }, async (req, reply) => {
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        category: z.string().default("vat"),
        jurisdiction: z.string().default("NG"),
        rateBps: z.number().int().nonnegative(),
        inclusive: z.boolean().default(false),
      })
      .parse(req.body);
    const rule = await prisma.billingTaxRule.create({
      data: {
        tenantId: req.tenantId!,
        ...body,
        metadata: {},
      },
    });
    return reply.code(201).send({ taxRule: rule });
  });

  app.get("/billing/settlements", { preHandler: settlement }, async (req) => {
    const settlements = await prisma.settlement.findMany({
      where: { tenantId: req.tenantId! },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { settlements };
  });

  app.post("/billing/webhooks", { preHandler: admin }, async (req, reply) => {
    const body = z
      .object({
        provider: z.string().default("mock"),
        payload: z.record(z.unknown()),
        signature: z.string().optional(),
      })
      .parse(req.body);
    try {
      const event = await processWebhook({
        provider: body.provider,
        payload: { ...body.payload, tenantId: req.tenantId! },
        signature: body.signature,
        tenantId: req.tenantId!,
      });
      return { event };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  /* Guest */
  app.get("/guest/billing", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const [invoices, payments, receipts] = await Promise.all([
      prisma.invoice.findMany({
        where: { tenantId: auth.tenantId, customerId: auth.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.payment.findMany({
        where: { tenantId: auth.tenantId, customerId: auth.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.receipt.findMany({
        where: { tenantId: auth.tenantId, customerId: auth.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return { invoices, payments, receipts };
  });

  app.get("/guest/billing/invoices", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: auth.tenantId, customerId: auth.customerId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    return { invoices };
  });

  app.get("/guest/billing/invoices/:id", { preHandler: requireGuest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId: auth.tenantId, customerId: auth.customerId },
      include: { lines: true, payments: true, receipts: true },
    });
    if (!invoice) return reply.code(404).send({ error: "not_found" });
    return { invoice };
  });

  app.post("/guest/billing/payment-intents", { preHandler: requireGuest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        invoiceId: z.string().min(1),
        idempotencyKey: z.string().min(1),
        scenario: z.string().optional(),
      })
      .parse(req.body);
    const invoice = await prisma.invoice.findFirst({
      where: { id: body.invoiceId, tenantId: auth.tenantId, customerId: auth.customerId },
    });
    if (!invoice) return reply.code(404).send({ error: "not_found" });
    try {
      const intent = await createPaymentIntent({
        tenantId: auth.tenantId,
        invoiceId: invoice.id,
        idempotencyKey: body.idempotencyKey,
        scenario: body.scenario,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return reply.code(201).send({ intent });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/guest/billing/payment-intents/:id/capture", { preHandler: requireGuest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const intent = await prisma.paymentIntent.findFirst({
      where: { id, tenantId: auth.tenantId, customerId: auth.customerId },
    });
    if (!intent) return reply.code(404).send({ error: "not_found" });
    const body = z.object({ idempotencyKey: z.string().optional() }).parse(req.body ?? {});
    try {
      const result = await authorizeAndCapture({
        tenantId: auth.tenantId,
        intentId: intent.id,
        idempotencyKey: body.idempotencyKey,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return result;
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/guest/billing/payments", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const payments = await prisma.payment.findMany({
      where: { tenantId: auth.tenantId, customerId: auth.customerId },
      orderBy: { createdAt: "desc" },
    });
    return { payments };
  });

  app.get("/guest/billing/receipts", { preHandler: requireGuest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const receipts = await prisma.receipt.findMany({
      where: { tenantId: auth.tenantId, customerId: auth.customerId },
      orderBy: { createdAt: "desc" },
    });
    return { receipts };
  });
}
