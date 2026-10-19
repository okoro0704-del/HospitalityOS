import type { Prisma } from "@prisma/client";
import {
  isManualPaymentMethod,
  MANUAL_METHODS_REQUIRING_VERIFICATION,
} from "@hospitalityos/shared";
import { prisma } from "../../db.js";
import { writeAudit } from "../../lib/audit.js";
import { taxFromInclusive, taxOnExclusive } from "./money.js";
import { getPaymentProvider } from "./providers.js";

async function lifecycle() {
  return import("./lifecycle.js");
}

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
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid,
      amountDue,
      status,
      paidAt: status === "paid" ? new Date() : invoice.paidAt,
    },
  });
  const { syncVerticalOnInvoicePaid } = await lifecycle();
  await syncVerticalOnInvoicePaid(invoiceId).catch(() => undefined);
  return updated;
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
  if (intent.provider !== "manual" && intent.provider !== "cash" && intent.providerRef) {
    const provider = getPaymentProvider(intent.provider);
    await provider.cancel({ providerRef: intent.providerRef });
  }
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
  branchId?: string | null;
  notes?: string | null;
  externalReference?: string | null;
  correlationId?: string | null;
}) {
  const result = await collectManualPayment({
    ...opts,
    methodType: "cash",
    collectedByStaffId: opts.staffId,
  });
  return result.payment;
}

/**
 * Create a manual payment intent (Invoice → Intent).
 * Guest-facing methods (pay_at_venue / pay_to_staff) start as awaiting_collection.
 */
export async function createManualPaymentIntent(opts: {
  tenantId: string;
  invoiceId: string;
  amount: number;
  methodType: string;
  idempotencyKey: string;
  actorKind?: string;
  actorId?: string | null;
  branchId?: string | null;
  notes?: string | null;
  correlationId?: string | null;
}) {
  if (!isManualPaymentMethod(opts.methodType)) {
    throw httpError("Invalid manual payment method", "validation_error", 400);
  }

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
  if (!["open", "partially_paid", "overdue"].includes(invoice.status)) {
    throw httpError(`Invoice cannot accept payment in status ${invoice.status}`, "invalid_state", 400);
  }
  if (opts.amount <= 0 || opts.amount > invoice.amountDue) {
    throw httpError("Invalid payment amount", "validation_error", 400);
  }

  const guestFacing = opts.methodType === "pay_at_venue" || opts.methodType === "pay_to_staff";
  const status = guestFacing ? "awaiting_collection" : "created";
  const correlationId = opts.correlationId ?? `man_${opts.idempotencyKey}`;

  const intent = await prisma.paymentIntent.create({
    data: {
      tenantId: opts.tenantId,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      amount: opts.amount,
      currency: invoice.currency,
      provider: "manual",
      status,
      idempotencyKey: opts.idempotencyKey,
      providerRef: `manual_${opts.idempotencyKey}`,
      metadata: {
        methodType: opts.methodType,
        branchId: opts.branchId ?? null,
        notes: opts.notes ?? null,
        correlationId,
        requiresVerification: (
          MANUAL_METHODS_REQUIRING_VERIFICATION as readonly string[]
        ).includes(opts.methodType),
      } as Prisma.InputJsonValue,
    },
  });

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "system",
    actorId: opts.actorId,
    action: "payment_created",
    resource: "payment_intent",
    resourceId: intent.id,
    source: "manual",
    metadata: { methodType: opts.methodType, correlationId, amount: opts.amount },
  });

  return intent;
}

/**
 * Staff collects a manual payment (Intent → Collection → Payment [→ Receipt]).
 * Bank transfers stay pending_verification until verifyManualPayment.
 */
export async function collectManualPayment(opts: {
  tenantId: string;
  invoiceId?: string;
  intentId?: string;
  amount?: number;
  methodType: string;
  staffId: string;
  collectedByStaffId?: string;
  branchId?: string | null;
  idempotencyKey: string;
  externalReference?: string | null;
  notes?: string | null;
  terminalName?: string | null;
  receivedAt?: Date | null;
  actorKind?: string;
  correlationId?: string | null;
  /** When true, acting staff may set collectedByStaffId to another staff member. */
  allowCollectForOthers?: boolean;
}) {
  if (!isManualPaymentMethod(opts.methodType)) {
    throw httpError("Invalid manual payment method", "validation_error", 400);
  }

  const existing = await prisma.payment.findUnique({
    where: {
      tenantId_idempotencyKey: { tenantId: opts.tenantId, idempotencyKey: opts.idempotencyKey },
    },
    include: { receipts: true },
  });
  if (existing) return { payment: existing, receipt: existing.receipts[0] ?? null, intent: null };

  const collectorId = opts.collectedByStaffId ?? opts.staffId;
  if (collectorId !== opts.staffId && !opts.allowCollectForOthers) {
    throw httpError(
      "Cannot claim collection for another staff member",
      "forbidden",
      403,
    );
  }

  let intent =
    opts.intentId
      ? await prisma.paymentIntent.findFirst({
          where: { id: opts.intentId, tenantId: opts.tenantId },
        })
      : null;

  let invoiceId = opts.invoiceId ?? intent?.invoiceId ?? null;
  if (!invoiceId) throw httpError("invoiceId or intentId required", "validation_error", 400);

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: opts.tenantId },
  });
  if (!invoice) throw httpError("Invoice not found", "not_found", 404);

  // Live remaining balance (includes pending_verification reservations) to reduce over-collect races.
  const existingPays = await prisma.payment.findMany({
    where: {
      invoiceId: invoice.id,
      status: { in: ["captured", "partially_refunded", "refunded", "pending_verification"] },
    },
    select: { status: true, amount: true, capturedAmount: true, refundedAmount: true },
  });
  const reservedAmount = existingPays.reduce((sum, p) => {
    if (p.status === "pending_verification") return sum + p.amount;
    return sum + (p.capturedAmount - p.refundedAmount);
  }, 0);
  const liveDue = Math.max(0, invoice.total - reservedAmount);

  const amount = opts.amount ?? intent?.amount ?? liveDue;
  if (amount <= 0 || amount > liveDue) {
    throw httpError("Invalid payment amount", "validation_error", 400);
  }

  if (opts.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: opts.branchId, tenantId: opts.tenantId },
    });
    if (!branch) throw httpError("Branch not found", "not_found", 404);
  }

  const correlationId =
    opts.correlationId ??
    (intent?.metadata &&
    typeof intent.metadata === "object" &&
    intent.metadata !== null &&
    "correlationId" in intent.metadata
      ? String((intent.metadata as Record<string, unknown>).correlationId)
      : `man_${opts.idempotencyKey}`);

  if (!intent) {
    intent = await createManualPaymentIntent({
      tenantId: opts.tenantId,
      invoiceId: invoice.id,
      amount,
      methodType: opts.methodType,
      idempotencyKey: `intent_${opts.idempotencyKey}`,
      actorKind: opts.actorKind ?? "staff",
      actorId: opts.staffId,
      branchId: opts.branchId,
      notes: opts.notes,
      correlationId,
    });
  } else {
    if (intent.provider !== "manual" && intent.provider !== "cash") {
      throw httpError("Intent is not a manual payment intent", "invalid_state", 400);
    }
    if (["captured", "cancelled", "failed"].includes(intent.status)) {
      throw httpError(`Intent cannot be collected in status ${intent.status}`, "invalid_state", 400);
    }
  }

  const needsVerification = (
    MANUAL_METHODS_REQUIRING_VERIFICATION as readonly string[]
  ).includes(opts.methodType);
  const now = opts.receivedAt ?? new Date();
  const paymentStatus = needsVerification ? "pending_verification" : "captured";

  // Safe card metadata only — never store PAN/CVV/PIN
  const safeMeta: Record<string, unknown> = {
    methodType: opts.methodType,
    correlationId,
    terminalName: opts.terminalName ?? null,
  };

  const payment = await prisma.$transaction(async (tx) => {
    const racePays = await tx.payment.findMany({
      where: {
        invoiceId: invoice.id,
        status: { in: ["captured", "partially_refunded", "refunded", "pending_verification"] },
      },
      select: { status: true, amount: true, capturedAmount: true, refundedAmount: true },
    });
    const raceReserved = racePays.reduce((sum, p) => {
      if (p.status === "pending_verification") return sum + p.amount;
      return sum + (p.capturedAmount - p.refundedAmount);
    }, 0);
    if (amount > Math.max(0, invoice.total - raceReserved)) {
      throw httpError("Invoice already fully collected", "conflict", 409);
    }
    return tx.payment.create({
      data: {
        tenantId: opts.tenantId,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        intentId: intent.id,
        amount,
        currency: invoice.currency,
        provider: "manual",
        providerRef: intent.providerRef,
        status: paymentStatus,
        methodType: opts.methodType,
        staffId: opts.staffId,
        collectedByStaffId: collectorId,
        branchId: opts.branchId ?? null,
        externalReference: opts.externalReference ?? null,
        notes: opts.notes ?? null,
        correlationId,
        capturedAmount: needsVerification ? 0 : amount,
        netAmount: needsVerification ? 0 : amount,
        idempotencyKey: opts.idempotencyKey,
        collectedAt: now,
        capturedAt: needsVerification ? null : now,
        metadata: safeMeta as Prisma.InputJsonValue,
      },
    });
  });

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: needsVerification ? "requires_action" : "captured",
      metadata: {
        ...((intent.metadata as Record<string, unknown>) ?? {}),
        methodType: opts.methodType,
        paymentId: payment.id,
        correlationId,
      } as Prisma.InputJsonValue,
    },
  });

  let receipt = null;
  if (!needsVerification) {
    receipt = await prisma.receipt.create({
      data: {
        tenantId: opts.tenantId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        customerId: invoice.customerId,
        number: await nextReceiptNumber(opts.tenantId),
        amount,
        currency: invoice.currency,
        methodType: opts.methodType,
        metadata: {
          staffId: opts.staffId,
          collectedByStaffId: collectorId,
          branchId: opts.branchId ?? null,
          externalReference: opts.externalReference ?? null,
          correlationId,
        } as Prisma.InputJsonValue,
      },
    });
    await refreshInvoicePaid(invoice.id);
  }

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "staff",
    actorId: opts.staffId,
    action: "payment_collected",
    resource: "payment",
    resourceId: payment.id,
    source: "manual",
    metadata: {
      methodType: opts.methodType,
      amount,
      branchId: opts.branchId,
      collectedByStaffId: collectorId,
      correlationId,
      status: paymentStatus,
    },
  });

  if (receipt) {
    await audit({
      tenantId: opts.tenantId,
      actorKind: opts.actorKind ?? "staff",
      actorId: opts.staffId,
      action: "payment_receipt_issued",
      resource: "receipt",
      resourceId: receipt.id,
      source: "manual",
      metadata: { paymentId: payment.id, correlationId },
    });
  }

  if (!needsVerification) {
    const { emitPaymentReceived } = await lifecycle();
    await emitPaymentReceived({
      tenantId: opts.tenantId,
      customerId: invoice.customerId,
      paymentId: payment.id,
      invoiceId: invoice.id,
      amount,
      currency: invoice.currency,
      methodType: opts.methodType,
      receiptNumber: receipt?.number ?? null,
    }).catch(() => undefined);
  }

  return { payment, receipt, intent };
}

/** Verify a pending_verification manual payment (e.g. bank transfer). */
export async function verifyManualPayment(opts: {
  tenantId: string;
  paymentId: string;
  staffId: string;
  actorKind?: string;
  notes?: string | null;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: opts.paymentId, tenantId: opts.tenantId },
  });
  if (!payment) throw httpError("Payment not found", "not_found", 404);
  if (payment.status !== "pending_verification") {
    throw httpError("Payment is not awaiting verification", "invalid_state", 400);
  }
  if (payment.provider !== "manual") {
    throw httpError("Only manual payments can be verified this way", "invalid_state", 400);
  }

  const { assertPaymentTransition } = await lifecycle();
  assertPaymentTransition(payment.status, "captured");

  const now = new Date();
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "captured",
      capturedAmount: payment.amount,
      netAmount: payment.amount,
      capturedAt: now,
      verifiedAt: now,
      verifiedByStaffId: opts.staffId,
      notes: opts.notes ?? payment.notes,
    },
  });

  if (payment.intentId) {
    await prisma.paymentIntent.update({
      where: { id: payment.intentId },
      data: { status: "captured" },
    });
  }

  const receipt = await prisma.receipt.create({
    data: {
      tenantId: opts.tenantId,
      invoiceId: payment.invoiceId,
      paymentId: payment.id,
      customerId: payment.customerId,
      number: await nextReceiptNumber(opts.tenantId),
      amount: payment.amount,
      currency: payment.currency,
      methodType: payment.methodType,
      metadata: {
        verifiedByStaffId: opts.staffId,
        collectedByStaffId: payment.collectedByStaffId,
        branchId: payment.branchId,
        externalReference: payment.externalReference,
        correlationId: payment.correlationId,
      } as Prisma.InputJsonValue,
    },
  });

  if (payment.invoiceId) await refreshInvoicePaid(payment.invoiceId);

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "staff",
    actorId: opts.staffId,
    action: "payment_verified",
    resource: "payment",
    resourceId: payment.id,
    source: "manual",
    metadata: { correlationId: payment.correlationId },
  });
  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "staff",
    actorId: opts.staffId,
    action: "payment_receipt_issued",
    resource: "receipt",
    resourceId: receipt.id,
    source: "manual",
    metadata: { paymentId: payment.id, correlationId: payment.correlationId },
  });

  const { emitPaymentVerified, emitPaymentReceived } = await lifecycle();
  if (payment.customerId) {
    await emitPaymentVerified({
      tenantId: opts.tenantId,
      customerId: payment.customerId,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      currency: payment.currency,
    }).catch(() => undefined);
    await emitPaymentReceived({
      tenantId: opts.tenantId,
      customerId: payment.customerId,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      currency: payment.currency,
      methodType: payment.methodType,
      receiptNumber: receipt.number,
    }).catch(() => undefined);
  }

  return { payment: updated, receipt };
}

export async function getStaffCollectionsSummary(opts: {
  tenantId: string;
  day?: Date;
  branchId?: string | null;
}) {
  const start = new Date(opts.day ?? new Date());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const payments = await prisma.payment.findMany({
    where: {
      tenantId: opts.tenantId,
      provider: "manual",
      status: { in: ["captured", "pending_verification", "partially_refunded"] },
      collectedAt: { gte: start, lt: end },
      ...(opts.branchId ? { branchId: opts.branchId } : {}),
    },
    orderBy: { collectedAt: "asc" },
  });

  const staffIds = [
    ...new Set(
      payments
        .map((p) => p.collectedByStaffId ?? p.staffId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const staffRows = staffIds.length
    ? await prisma.staffMember.findMany({
        where: { tenantId: opts.tenantId, id: { in: staffIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameById = Object.fromEntries(staffRows.map((s) => [s.id, s.displayName]));

  type Bucket = { methodType: string; amount: number; count: number };
  const byStaff = new Map<
    string,
    { staffId: string; displayName: string; total: number; methods: Record<string, Bucket> }
  >();

  for (const p of payments) {
    const sid = p.collectedByStaffId ?? p.staffId ?? "unknown";
    let row = byStaff.get(sid);
    if (!row) {
      row = {
        staffId: sid,
        displayName: nameById[sid] ?? "Unknown",
        total: 0,
        methods: {},
      };
      byStaff.set(sid, row);
    }
    const credited = p.status === "pending_verification" ? p.amount : p.capturedAmount;
    row.total += credited;
    const m = row.methods[p.methodType] ?? {
      methodType: p.methodType,
      amount: 0,
      count: 0,
    };
    m.amount += credited;
    m.count += 1;
    row.methods[p.methodType] = m;
  }

  return {
    day: start.toISOString().slice(0, 10),
    branchId: opts.branchId ?? null,
    collectors: [...byStaff.values()].map((c) => ({
      staffId: c.staffId,
      displayName: c.displayName,
      total: c.total,
      methods: Object.values(c.methods),
    })),
    paymentCount: payments.length,
    grandTotal: [...byStaff.values()].reduce((s, c) => s + c.total, 0),
  };
}

export async function getBranchDailyReconciliation(opts: {
  tenantId: string;
  branchId?: string | null;
  day?: Date;
  openingCash?: number;
  /** Optional physical count; when omitted, difference is 0 (books balanced). */
  countedTotal?: number;
}) {
  const start = new Date(opts.day ?? new Date());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const whereBase = {
    tenantId: opts.tenantId,
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
  };

  const [manualPayments, refunds] = await Promise.all([
    prisma.payment.findMany({
      where: {
        ...whereBase,
        provider: "manual",
        status: { in: ["captured", "partially_refunded", "refunded"] },
        capturedAt: { gte: start, lt: end },
      },
    }),
    prisma.refund.findMany({
      where: {
        tenantId: opts.tenantId,
        status: "completed",
        completedAt: { gte: start, lt: end },
        payment: opts.branchId ? { branchId: opts.branchId } : undefined,
      },
      include: { payment: { select: { methodType: true, branchId: true, provider: true } } },
    }),
  ]);

  const cashCollected = manualPayments
    .filter((p) => p.methodType === "cash")
    .reduce((s, p) => s + p.capturedAmount, 0);
  const otherManual = manualPayments
    .filter((p) => p.methodType !== "cash")
    .reduce((s, p) => s + p.capturedAmount, 0);
  const refundTotal = refunds
    .filter((r) => r.payment.provider === "manual")
    .reduce((s, r) => s + r.amount, 0);

  const openingCash = opts.openingCash ?? 0;
  const recordedTotal = cashCollected + otherManual;
  const expectedTotal = openingCash + cashCollected + otherManual - refundTotal;
  const countedTotal = opts.countedTotal ?? expectedTotal;
  const difference = expectedTotal - countedTotal;

  return {
    day: start.toISOString().slice(0, 10),
    branchId: opts.branchId ?? null,
    openingCash,
    cashCollected,
    manualPayments: otherManual,
    refunds: refundTotal,
    recordedTotal,
    expectedTotal,
    countedTotal,
    difference,
    paymentCount: manualPayments.length,
    refundCount: refunds.filter((r) => r.payment.provider === "manual").length,
  };
}

/** Close an operational day — stores a Settlement snapshot (not full accounting). */
export async function closeDailyReconciliation(opts: {
  tenantId: string;
  branchId?: string | null;
  day?: Date;
  openingCash?: number;
  countedTotal: number;
  staffId: string;
  notes?: string | null;
}) {
  const snapshot = await getBranchDailyReconciliation({
    tenantId: opts.tenantId,
    branchId: opts.branchId,
    day: opts.day,
    openingCash: opts.openingCash,
    countedTotal: opts.countedTotal,
  });

  const dayKey = snapshot.day;
  const branchKey = opts.branchId ?? "all";
  const idempotencyRef = `recon_${dayKey}_${branchKey}`;

  const existing = await prisma.settlement.findFirst({
    where: {
      tenantId: opts.tenantId,
      provider: "operational_reconciliation",
      providerRef: idempotencyRef,
      status: "settled",
    },
  });
  if (existing) {
    return { settlement: existing, reconciliation: snapshot, alreadyClosed: true };
  }

  const settlement = await prisma.settlement.create({
    data: {
      tenantId: opts.tenantId,
      provider: "operational_reconciliation",
      providerRef: idempotencyRef,
      currency: "NGN",
      grossAmount: snapshot.recordedTotal,
      feeAmount: 0,
      netAmount: snapshot.expectedTotal,
      status: "settled",
      settledAt: new Date(),
      metadata: {
        type: "daily_reconciliation",
        day: dayKey,
        branchId: opts.branchId ?? null,
        openingCash: snapshot.openingCash,
        cashCollected: snapshot.cashCollected,
        manualPayments: snapshot.manualPayments,
        refunds: snapshot.refunds,
        expectedTotal: snapshot.expectedTotal,
        countedTotal: snapshot.countedTotal,
        difference: snapshot.difference,
        closedByStaffId: opts.staffId,
        notes: opts.notes ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  await audit({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.staffId,
    action: "reconciliation.closed",
    resource: "settlement",
    resourceId: settlement.id,
    source: "manual",
    metadata: { day: dayKey, branchId: opts.branchId ?? null, difference: snapshot.difference },
  });

  return { settlement, reconciliation: snapshot, alreadyClosed: false };
}

export async function createRefund(opts: {
  tenantId: string;
  paymentId: string;
  amount: number;
  reason?: string | null;
  idempotencyKey: string;
  staffId?: string | null;
  /** Who authorized the refund (defaults to processing staff). */
  authorizedByStaffId?: string | null;
  actorKind?: string;
  correlationId?: string | null;
}) {
  const existing = await prisma.refund.findUnique({
    where: {
      tenantId_idempotencyKey: { tenantId: opts.tenantId, idempotencyKey: opts.idempotencyKey },
    },
  });
  if (existing) return existing;

  const paymentProbe = await prisma.payment.findFirst({
    where: { id: opts.paymentId, tenantId: opts.tenantId },
  });
  if (!paymentProbe) throw httpError("Payment not found", "not_found", 404);
  if (!["captured", "partially_refunded"].includes(paymentProbe.status)) {
    throw httpError("Payment is not refundable", "invalid_state", 400);
  }
  if (opts.amount <= 0) {
    throw httpError("Refund exceeds captured amount", "validation_error", 400);
  }

  let providerStatus: "completed" | "failed" = "completed";
  if (
    paymentProbe.provider !== "cash" &&
    paymentProbe.provider !== "manual" &&
    paymentProbe.providerRef
  ) {
    const provider = getPaymentProvider(paymentProbe.provider);
    const result = await provider.refund({
      providerRef: paymentProbe.providerRef,
      amount: opts.amount,
      idempotencyKey: opts.idempotencyKey,
    });
    providerStatus = result.status;
  }

  const processedBy = opts.staffId ?? null;
  const authorizedBy = opts.authorizedByStaffId ?? processedBy;
  const now = new Date();

  const { refund, payment, created } = await prisma.$transaction(async (tx) => {
    const again = await tx.refund.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: opts.tenantId,
          idempotencyKey: opts.idempotencyKey,
        },
      },
    });
    if (again) return { refund: again, payment: paymentProbe, created: false };

    const payment = await tx.payment.findFirst({
      where: { id: opts.paymentId, tenantId: opts.tenantId },
    });
    if (!payment) throw httpError("Payment not found", "not_found", 404);
    if (!["captured", "partially_refunded"].includes(payment.status)) {
      throw httpError("Payment is not refundable", "invalid_state", 400);
    }
    const remaining = payment.capturedAmount - payment.refundedAmount;
    if (opts.amount > remaining) {
      throw httpError("Refund exceeds captured amount", "validation_error", 400);
    }

    const refund = await tx.refund.create({
      data: {
        tenantId: opts.tenantId,
        paymentId: payment.id,
        amount: opts.amount,
        currency: payment.currency,
        reason: opts.reason ?? null,
        status: providerStatus === "completed" ? "completed" : "failed",
        providerRef: `re_${opts.idempotencyKey}`,
        idempotencyKey: opts.idempotencyKey,
        staffId: processedBy,
        completedAt: providerStatus === "completed" ? now : null,
        metadata: {
          authorizedByStaffId: authorizedBy,
          processedByStaffId: processedBy,
          correlationId: opts.correlationId ?? payment.correlationId,
          methodType: payment.methodType,
          provider: payment.provider,
        } as Prisma.InputJsonValue,
      },
    });

    if (providerStatus === "completed") {
      const refundedAmount = payment.refundedAmount + opts.amount;
      const status =
        refundedAmount >= payment.capturedAmount ? "refunded" : "partially_refunded";
      const { assertPaymentTransition } = await lifecycle();
      assertPaymentTransition(payment.status, status);
      await tx.payment.update({
        where: { id: payment.id },
        data: { refundedAmount, status },
      });
    }

    return { refund, payment, created: true };
  });

  if (!created) return refund;

  if (providerStatus === "completed" && refund.status === "completed") {
    if (payment.invoiceId) await refreshInvoicePaid(payment.invoiceId);
    const { emitRefundIssued } = await lifecycle();

    await audit({
      tenantId: opts.tenantId,
      actorKind: opts.actorKind ?? "staff",
      actorId: opts.staffId,
      action: "billing.refund.created",
      resource: "refund",
      resourceId: refund.id,
    });
    await audit({
      tenantId: opts.tenantId,
      actorKind: opts.actorKind ?? "staff",
      actorId: opts.staffId,
      action: "payment_refunded",
      resource: "payment",
      resourceId: payment.id,
      source: payment.provider === "manual" || payment.provider === "cash" ? "manual" : payment.provider,
      metadata: {
        refundId: refund.id,
        amount: opts.amount,
        reason: opts.reason ?? null,
        authorizedByStaffId: authorizedBy,
        processedByStaffId: processedBy,
        correlationId: opts.correlationId ?? payment.correlationId,
      },
    });

    if (payment.customerId) {
      await emitRefundIssued({
        tenantId: opts.tenantId,
        customerId: payment.customerId,
        paymentId: payment.id,
        refundId: refund.id,
        amount: opts.amount,
        currency: payment.currency,
        reason: opts.reason,
      }).catch(() => undefined);
    }

    return refund;
  }

  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "staff",
    actorId: opts.staffId,
    action: "billing.refund.created",
    resource: "refund",
    resourceId: refund.id,
  });
  await audit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind ?? "staff",
    actorId: opts.staffId,
    action: "payment_refunded",
    resource: "payment",
    resourceId: payment.id,
    source: payment.provider === "manual" || payment.provider === "cash" ? "manual" : payment.provider,
    metadata: {
      refundId: refund.id,
      amount: opts.amount,
      reason: opts.reason ?? null,
      authorizedByStaffId: authorizedBy,
      processedByStaffId: processedBy,
      correlationId: opts.correlationId ?? payment.correlationId,
    },
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

  // Resolve tenant from authoritative payment/intent records — never trust payload.tenantId alone.
  let resolvedTenantId = opts.tenantId ?? null;
  const providerRef =
    typeof opts.payload.providerRef === "string"
      ? opts.payload.providerRef
      : typeof verified.payload.providerRef === "string"
        ? verified.payload.providerRef
        : null;

  if (providerRef) {
    const intent = await prisma.paymentIntent.findFirst({
      where: { providerRef },
      select: { tenantId: true },
    });
    const payment = intent
      ? null
      : await prisma.payment.findFirst({
          where: { providerRef },
          select: { tenantId: true },
        });
    const fromDb = intent?.tenantId ?? payment?.tenantId ?? null;
    if (fromDb) {
      if (resolvedTenantId && resolvedTenantId !== fromDb) {
        throw Object.assign(new Error("Webhook tenant mismatch"), {
          code: "forbidden",
          statusCode: 403,
        });
      }
      resolvedTenantId = fromDb;
    }
  }

  if (!resolvedTenantId) {
    throw Object.assign(new Error("Unable to associate webhook with a tenant"), {
      code: "invalid_webhook",
      statusCode: 400,
    });
  }

  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_eventId: { provider: opts.provider, eventId: verified.eventId } },
  });
  if (existing?.status === "processed") return existing;

  const event =
    existing ??
    (await prisma.paymentWebhookEvent.create({
      data: {
        tenantId: resolvedTenantId,
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
    tenantId: resolvedTenantId,
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
