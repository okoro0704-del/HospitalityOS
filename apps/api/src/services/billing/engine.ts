import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { writeAudit } from "../../lib/audit.js";
import { taxFromInclusive, taxOnExclusive } from "./money.js";
import { getPaymentProvider } from "./providers.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function audit(opts: {
  tenantId: string;
  actorKind?: string | null;
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.paymentAuditEvent.create({
    data: {
      tenantId: opts.tenantId,
      actorKind: opts.actorKind ?? null,
      actorId: opts.actorId ?? null,
      action: opts.action,
      resource: opts.resource,
      resourceId: opts.resourceId ?? null,
      source: opts.source ?? null,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "system",
    actorId: opts.actorId,
    action: opts.action,
    resource: opts.resource,
    resourceId: opts.resourceId,
    metadata: opts.metadata,
  });
}

export async function ensureBillingAccount(opts: {
  tenantId: string;
  customerId: string;
  currency?: string;
}) {
  const currency = opts.currency ?? "NGN";
  return prisma.billingAccount.upsert({
    where: {
      tenantId_customerId_currency: {
        tenantId: opts.tenantId,
        customerId: opts.customerId,
        currency,
      },
    },
    create: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      currency,
      balance: 0,
      credit: 0,
      status: "active",
      metadata: {},
    },
    update: {},
  });
}

export async function ensurePaymentCustomer(opts: {
  tenantId: string;
  customerId: string;
  currency?: string;
}) {
  return prisma.paymentCustomer.upsert({
    where: {
      tenantId_customerId: { tenantId: opts.tenantId, customerId: opts.customerId },
    },
    create: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      provider: "mock",
      providerRef: `pc_${opts.customerId}`,
      defaultCurrency: opts.currency ?? "NGN",
      metadata: {},
    },
    update: {},
  });
}

async function nextInvoiceNumber(tenantId: string) {
  const count = await prisma.invoice.count({ where: { tenantId } });
  return `INV-${String(count + 1).padStart(6, "0")}`;
}

async function nextReceiptNumber(tenantId: string) {
  const count = await prisma.receipt.count({ where: { tenantId } });
  return `RCP-${String(count + 1).padStart(6, "0")}`;
}

async function nextCreditNoteNumber(tenantId: string) {
  const count = await prisma.creditNote.count({ where: { tenantId } });
  return `CN-${String(count + 1).padStart(6, "0")}`;
}

export type BillableLineInput = {
  sourceModule?: string;
  sourceEntityId?: string;
  billableType?: string;
  description: string;
  quantity?: number;
  unitAmount: number; // minor units
  discountAmount?: number;
  taxAmount?: number;
  metadata?: Record<string, unknown>;
};

export async function createInvoice(opts: {
  tenantId: string;
  customerId: string;
  currency: string;
  lines: BillableLineInput[];
  dueDate?: Date | null;
  taxRuleCode?: string | null;
  status?: "draft" | "open";
  notes?: string | null;
  actorKind?: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!opts.lines.length) throw httpError("Invoice requires lines", "validation_error", 400);

  const account = await ensureBillingAccount({
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    currency: opts.currency,
  });
  await ensurePaymentCustomer({
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    currency: opts.currency,
  });

  let taxRule = opts.taxRuleCode
    ? await prisma.billingTaxRule.findFirst({
        where: { tenantId: opts.tenantId, code: opts.taxRuleCode, status: "active" },
      })
    : await prisma.billingTaxRule.findFirst({
        where: { tenantId: opts.tenantId, status: "active" },
        orderBy: { createdAt: "asc" },
      });

  const computedLines = opts.lines.map((l) => {
    const qty = l.quantity ?? 1;
    const discount = l.discountAmount ?? 0;
    const gross = qty * l.unitAmount - discount;
    let tax = l.taxAmount ?? 0;
    if (l.taxAmount == null && taxRule) {
      tax = taxRule.inclusive
        ? taxFromInclusive(gross, taxRule.rateBps)
        : taxOnExclusive(gross, taxRule.rateBps);
    }
    const lineTotal = taxRule?.inclusive ? gross : gross + tax;
    return {
      ...l,
      quantity: qty,
      discountAmount: discount,
      taxAmount: tax,
      total: lineTotal,
      netBeforeTax: taxRule?.inclusive ? gross - tax : gross,
    };
  });

  const subtotal = computedLines.reduce((s, l) => s + l.netBeforeTax, 0);
  const discountTotal = computedLines.reduce((s, l) => s + l.discountAmount, 0);
  const taxTotal = computedLines.reduce((s, l) => s + l.taxAmount, 0);
  const total = computedLines.reduce((s, l) => s + l.total, 0);

  const number = await nextInvoiceNumber(opts.tenantId);
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: opts.tenantId,
      billingAccountId: account.id,
      customerId: opts.customerId,
      number,
      currency: opts.currency,
      status: opts.status ?? "open",
      subtotal,
      discountTotal,
      taxTotal,
      total,
      amountPaid: 0,
      amountDue: total,
      dueDate: opts.dueDate ?? null,
      notes: opts.notes ?? null,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
      lines: {
        create: computedLines.map((l) => ({
          tenantId: opts.tenantId,
          sourceModule: l.sourceModule ?? null,
          sourceEntityId: l.sourceEntityId ?? null,
          billableType: l.billableType ?? null,
          description: l.description,
          quantity: l.quantity,
          unitAmount: l.unitAmount,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          total: l.total,
          metadata: (l.metadata ?? {}) as Prisma.InputJsonValue,
        })),
      },
    },
    include: { lines: true },
  });

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "billing.invoice.created",
    resource: "invoice",
    resourceId: invoice.id,
    source: "billing",
  });

  return invoice;
}

/** Upsert a BillableItem and optionally create/open an invoice for it. */
export async function recordBillableItem(opts: {
  tenantId: string;
  customerId: string;
  billableType: string;
  sourceModule: string;
  sourceEntityId: string;
  description: string;
  currency: string;
  unitAmount: number;
  quantity?: number;
  discountAmount?: number;
  createInvoice?: boolean;
  actorKind?: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const qty = opts.quantity ?? 1;
  const discount = opts.discountAmount ?? 0;
  const total = qty * opts.unitAmount - discount;
  const item = await prisma.billableItem.upsert({
    where: {
      tenantId_sourceModule_sourceEntityId: {
        tenantId: opts.tenantId,
        sourceModule: opts.sourceModule,
        sourceEntityId: opts.sourceEntityId,
      },
    },
    create: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      billableType: opts.billableType,
      sourceModule: opts.sourceModule,
      sourceEntityId: opts.sourceEntityId,
      description: opts.description,
      currency: opts.currency,
      quantity: qty,
      unitAmount: opts.unitAmount,
      discountAmount: discount,
      taxAmount: 0,
      total,
      status: "open",
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      description: opts.description,
      unitAmount: opts.unitAmount,
      quantity: qty,
      discountAmount: discount,
      total,
    },
  });

  if (opts.createInvoice !== false && !item.invoiceId) {
    const invoice = await createInvoice({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      currency: opts.currency,
      lines: [
        {
          sourceModule: opts.sourceModule,
          sourceEntityId: opts.sourceEntityId,
          billableType: opts.billableType,
          description: opts.description,
          quantity: qty,
          unitAmount: opts.unitAmount,
          discountAmount: discount,
        },
      ],
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    });
    return prisma.billableItem.update({
      where: { id: item.id },
      data: { invoiceId: invoice.id, status: "invoiced" },
    });
  }
  return item;
}

export async function createPaymentIntent(opts: {
  tenantId: string;
  invoiceId: string;
  amount?: number;
  idempotencyKey: string;
  provider?: string;
  scenario?: string | null;
  actorKind?: string;
  actorId?: string | null;
}) {
  const existing = await prisma.paymentIntent.findUnique({
    where: {
      tenantId_idempotencyKey: { tenantId: opts.tenantId, idempotencyKey: opts.idempotencyKey },
    },
  });
  if (existing) return existing;

  const invoice = await prisma.invoice.findFirst({
    where: { id: opts.invoiceId, tenantId: opts.tenantId },
  });
  if (!invoice) throw httpError("Invoice not found", "not_found", 404);
  if (["void", "paid"].includes(invoice.status)) {
    throw httpError("Invoice is not payable", "invoice_not_payable", 400);
  }

  const amount = opts.amount ?? invoice.amountDue;
  if (amount <= 0) throw httpError("Amount must be positive", "validation_error", 400);
  if (amount > invoice.amountDue) {
    throw httpError("Amount exceeds amount due", "validation_error", 400);
  }

  const provider = getPaymentProvider(opts.provider ?? "mock");
  const result = await provider.createPaymentIntent({
    amount,
    currency: invoice.currency,
    idempotencyKey: opts.idempotencyKey,
    scenario: opts.scenario,
  });

  const intent = await prisma.paymentIntent.create({
    data: {
      tenantId: opts.tenantId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      amount,
      currency: invoice.currency,
      provider: provider.id,
      status: result.status,
      idempotencyKey: opts.idempotencyKey,
      providerRef: result.providerRef,
      scenario: opts.scenario ?? null,
      metadata: {},
    },
  });

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "billing.payment_intent.created",
    resource: "payment_intent",
    resourceId: intent.id,
    source: "billing",
  });

  return intent;
}

async function refreshInvoicePaid(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const payments = await prisma.payment.findMany({
    where: { invoiceId, status: { in: ["captured", "partially_refunded", "refunded"] } },
  });
  const amountPaid = payments.reduce((s, p) => s + (p.capturedAmount - p.refundedAmount), 0);
  const amountDue = Math.max(0, invoice.total - amountPaid);
  let status = invoice.status;
  if (invoice.status !== "void") {
    if (amountPaid <= 0) status = "open";
    else if (amountDue > 0) status = "partially_paid";
    else status = "paid";
  }
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid,
      amountDue,
      status,
      paidAt: status === "paid" ? new Date() : invoice.paidAt,
    },
  });
}

export async function authorizeAndCapture(opts: {
  tenantId: string;
  intentId: string;
  idempotencyKey?: string;
  actorKind?: string;
  actorId?: string | null;
}) {
  const intent = await prisma.paymentIntent.findFirst({
    where: { id: opts.intentId, tenantId: opts.tenantId },
  });
  if (!intent) throw httpError("Payment intent not found", "not_found", 404);

  const payKey = opts.idempotencyKey ?? `pay_${intent.idempotencyKey}`;
  const existingPay = await prisma.payment.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: opts.tenantId, idempotencyKey: payKey } },
  });
  if (existingPay) return { intent, payment: existingPay, receipt: null };

  if (["captured", "cancelled", "expired"].includes(intent.status)) {
    throw httpError(`Cannot capture intent in status ${intent.status}`, "invalid_state", 400);
  }

  const provider = getPaymentProvider(intent.provider);
  const auth = await provider.authorize({
    providerRef: intent.providerRef!,
    scenario: intent.scenario,
  });
  if (auth.status === "failed") {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "failed" },
    });
    throw httpError("Authorization failed", "payment_failed", 402);
  }

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: "authorized" },
  });

  const capture = await provider.capture({
    providerRef: intent.providerRef!,
    amount: intent.amount,
    scenario: intent.scenario,
  });
  if (capture.status === "failed") {
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: "failed" },
    });
    throw httpError("Capture failed", "payment_failed", 402);
  }

  const fee = capture.feeMinor ?? 0;
  const payment = await prisma.payment.create({
    data: {
      tenantId: opts.tenantId,
      customerId: intent.customerId,
      invoiceId: intent.invoiceId,
      intentId: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      provider: intent.provider,
      providerRef: intent.providerRef,
      status: "captured",
      methodType: "card",
      capturedAmount: intent.amount,
      refundedAmount: 0,
      providerFee: fee,
      netAmount: intent.amount - fee,
      idempotencyKey: payKey,
      authorizedAt: new Date(),
      capturedAt: new Date(),
      metadata: {},
    },
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: "captured" },
  });

  await prisma.billingTransaction.create({
    data: {
      tenantId: opts.tenantId,
      paymentId: payment.id,
      type: "capture",
      amount: payment.amount,
      currency: payment.currency,
      direction: "in",
      status: "posted",
      metadata: { fee },
    },
  });

  let receipt = null;
  if (intent.invoiceId) {
    await refreshInvoicePaid(intent.invoiceId);
    receipt = await prisma.receipt.create({
      data: {
        tenantId: opts.tenantId,
        invoiceId: intent.invoiceId,
        paymentId: payment.id,
        customerId: intent.customerId,
        number: await nextReceiptNumber(opts.tenantId),
        amount: payment.amount,
        currency: payment.currency,
        methodType: payment.methodType,
        metadata: {},
      },
    });

    // Settlement foundation record
    await prisma.settlement.create({
      data: {
        tenantId: opts.tenantId,
        provider: payment.provider,
        providerRef: payment.providerRef,
        currency: payment.currency,
        grossAmount: payment.amount,
        feeAmount: fee,
        netAmount: payment.amount - fee,
        status: "pending",
        metadata: {},
        items: {
          create: [
            {
              tenantId: opts.tenantId,
              paymentId: payment.id,
              amount: payment.amount,
              feeAmount: fee,
              netAmount: payment.amount - fee,
              metadata: {},
            },
          ],
        },
      },
    });
  }

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "billing.payment.captured",
    resource: "payment",
    resourceId: payment.id,
    source: "billing",
  });

  return { intent: await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }), payment, receipt };
}

export async function cancelPaymentIntent(opts: {
  tenantId: string;
  intentId: string;
  actorKind?: string;
  actorId?: string | null;
}) {
  const intent = await prisma.paymentIntent.findFirst({
    where: { id: opts.intentId, tenantId: opts.tenantId },
  });
  if (!intent) throw httpError("Payment intent not found", "not_found", 404);
  if (["captured", "cancelled"].includes(intent.status)) {
    throw httpError(`Cannot cancel intent in status ${intent.status}`, "invalid_state", 400);
  }
  const provider = getPaymentProvider(intent.provider);
  await provider.cancel({ providerRef: intent.providerRef! });
  const updated = await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: "cancelled" },
  });
  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "billing.payment_intent.cancelled",
    resource: "payment_intent",
    resourceId: intent.id,
  });
  return updated;
}

export async function recordCashPayment(opts: {
  tenantId: string;
  invoiceId: string;
  amount: number;
  staffId: string;
  idempotencyKey: string;
  actorKind?: string;
}) {
  const existing = await prisma.payment.findUnique({
    where: {
      tenantId_idempotencyKey: { tenantId: opts.tenantId, idempotencyKey: opts.idempotencyKey },
    },
  });
  if (existing) return existing;

  const invoice = await prisma.invoice.findFirst({
    where: { id: opts.invoiceId, tenantId: opts.tenantId },
  });
  if (!invoice) throw httpError("Invoice not found", "not_found", 404);
  if (opts.amount <= 0 || opts.amount > invoice.amountDue) {
    throw httpError("Invalid cash amount", "validation_error", 400);
  }

  const payment = await prisma.payment.create({
    data: {
      tenantId: opts.tenantId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      amount: opts.amount,
      currency: invoice.currency,
      provider: "cash",
      status: "captured",
      methodType: "cash",
      staffId: opts.staffId,
      capturedAmount: opts.amount,
      netAmount: opts.amount,
      idempotencyKey: opts.idempotencyKey,
      capturedAt: new Date(),
      metadata: {},
    },
  });

  await prisma.receipt.create({
    data: {
      tenantId: opts.tenantId,
      invoiceId: invoice.id,
      paymentId: payment.id,
      customerId: invoice.customerId,
      number: await nextReceiptNumber(opts.tenantId),
      amount: opts.amount,
      currency: invoice.currency,
      methodType: "cash",
      metadata: { staffId: opts.staffId },
    },
  });

  await refreshInvoicePaid(invoice.id);
  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "staff",
    actorId: opts.staffId,
    action: "billing.payment.cash",
    resource: "payment",
    resourceId: payment.id,
    source: "billing",
  });
  return payment;
}

export async function createRefund(opts: {
  tenantId: string;
  paymentId: string;
  amount: number;
  reason?: string | null;
  idempotencyKey: string;
  staffId?: string | null;
  actorKind?: string;
}) {
  const existing = await prisma.refund.findUnique({
    where: {
      tenantId_idempotencyKey: { tenantId: opts.tenantId, idempotencyKey: opts.idempotencyKey },
    },
  });
  if (existing) return existing;

  const payment = await prisma.payment.findFirst({
    where: { id: opts.paymentId, tenantId: opts.tenantId },
  });
  if (!payment) throw httpError("Payment not found", "not_found", 404);
  if (!["captured", "partially_refunded"].includes(payment.status)) {
    throw httpError("Payment is not refundable", "invalid_state", 400);
  }
  const remaining = payment.capturedAmount - payment.refundedAmount;
  if (opts.amount <= 0 || opts.amount > remaining) {
    throw httpError("Refund exceeds captured amount", "validation_error", 400);
  }

  let providerStatus: "completed" | "failed" = "completed";
  if (payment.provider !== "cash" && payment.providerRef) {
    const provider = getPaymentProvider(payment.provider);
    const result = await provider.refund({
      providerRef: payment.providerRef,
      amount: opts.amount,
      idempotencyKey: opts.idempotencyKey,
    });
    providerStatus = result.status;
  }

  const refund = await prisma.refund.create({
    data: {
      tenantId: opts.tenantId,
      paymentId: payment.id,
      amount: opts.amount,
      currency: payment.currency,
      reason: opts.reason ?? null,
      status: providerStatus === "completed" ? "completed" : "failed",
      providerRef: `re_${opts.idempotencyKey}`,
      idempotencyKey: opts.idempotencyKey,
      staffId: opts.staffId ?? null,
      completedAt: providerStatus === "completed" ? new Date() : null,
      metadata: {},
    },
  });

  if (providerStatus === "completed") {
    const refundedAmount = payment.refundedAmount + opts.amount;
    const status =
      refundedAmount >= payment.capturedAmount ? "refunded" : "partially_refunded";
    await prisma.payment.update({
      where: { id: payment.id },
      data: { refundedAmount, status },
    });
    if (payment.invoiceId) await refreshInvoicePaid(payment.invoiceId);
  }

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "staff",
    actorId: opts.staffId,
    action: "billing.refund.created",
    resource: "refund",
    resourceId: refund.id,
  });

  return refund;
}

export async function createCreditNote(opts: {
  tenantId: string;
  invoiceId: string;
  amount: number;
  reason?: string | null;
  staffId?: string | null;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: opts.invoiceId, tenantId: opts.tenantId },
  });
  if (!invoice) throw httpError("Invoice not found", "not_found", 404);
  if (invoice.status === "void") throw httpError("Invoice is void", "invalid_state", 400);
  if (opts.amount <= 0 || opts.amount > invoice.total) {
    throw httpError("Invalid credit note amount", "validation_error", 400);
  }

  const note = await prisma.creditNote.create({
    data: {
      tenantId: opts.tenantId,
      invoiceId: invoice.id,
      number: await nextCreditNoteNumber(opts.tenantId),
      amount: opts.amount,
      currency: invoice.currency,
      reason: opts.reason ?? null,
      status: "issued",
      staffId: opts.staffId ?? null,
      metadata: {},
    },
  });

  await audit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.staffId,
    action: "billing.credit_note.created",
    resource: "credit_note",
    resourceId: note.id,
  });

  return note;
}

export async function processWebhook(opts: {
  provider: string;
  payload: Record<string, unknown>;
  signature?: string;
  tenantId?: string | null;
}) {
  const provider = getPaymentProvider(opts.provider);
  const verified = await provider.verifyWebhook({
    payload: opts.payload,
    signature: opts.signature,
  });

  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_eventId: { provider: opts.provider, eventId: verified.eventId } },
  });
  if (existing?.status === "processed") return existing;

  const event =
    existing ??
    (await prisma.paymentWebhookEvent.create({
      data: {
        tenantId: opts.tenantId ?? (typeof opts.payload.tenantId === "string" ? opts.payload.tenantId : null),
        provider: opts.provider,
        eventId: verified.eventId,
        eventType: verified.eventType,
        payload: verified.payload as Prisma.InputJsonValue,
        status: "received",
      },
    }));

  await prisma.paymentWebhookEvent.update({
    where: { id: event.id },
    data: { status: "processed", processedAt: new Date() },
  });

  await audit({
    tenantId: event.tenantId ?? "system",
    action: "billing.webhook.processed",
    resource: "payment_webhook_event",
    resourceId: event.id,
    source: opts.provider,
    metadata: { eventType: verified.eventType },
  });

  return prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
}

export async function getBillingDashboard(tenantId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [outstanding, paidToday, refunds, failed, cash, pending] = await Promise.all([
    prisma.invoice.aggregate({
      where: { tenantId, status: { in: ["open", "partially_paid", "overdue"] } },
      _sum: { amountDue: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { tenantId, status: "captured", capturedAt: { gte: start } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.refund.count({ where: { tenantId, status: "completed" } }),
    prisma.payment.count({ where: { tenantId, status: "failed" } }),
    prisma.payment.count({ where: { tenantId, methodType: "cash" } }),
    prisma.paymentIntent.count({
      where: { tenantId, status: { in: ["created", "requires_action", "authorized"] } },
    }),
  ]);
  return {
    outstandingInvoices: outstanding._count,
    outstandingAmount: outstanding._sum.amountDue ?? 0,
    paidTodayCount: paidToday._count,
    paidTodayAmount: paidToday._sum.amount ?? 0,
    refunds,
    failedPayments: failed,
    cashPayments: cash,
    pendingIntents: pending,
  };
}
