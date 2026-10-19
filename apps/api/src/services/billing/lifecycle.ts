/**
 * Money lifecycle adapters — wire vertical completion into the shared billing engine.
 * Catalog and order totals are integer minor units end-to-end.
 * Legacy `unitAmountMajor` is converted at the boundary only.
 */
import {
  billAccommodation,
  billCinema,
  billCommerce,
  billDining,
  billEvents,
  billFitness,
  billSpa,
} from "./verticals.js";
import { createNotification } from "../../lib/notifications.js";
import { recordCustomerEvent } from "../crm.js";
import { prisma } from "../../db.js";
import { majorToMinor } from "./money-units.js";

/** @deprecated Prefer unitAmountMinor / majorToMinor — kept for boundary compatibility. */
export function majorFloatToMinor(major: number): number {
  return majorToMinor(major);
}

export type LifecycleBillResult = {
  billableItemId: string;
  invoiceId: string | null;
};

async function emitFinancialSideEffects(opts: {
  tenantId: string;
  customerId?: string | null;
  eventType: string;
  title: string;
  body: string;
  sourceModule: string;
  sourceEntityId: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  amount?: number;
  currency?: string;
  deepLink?: string | null;
  actorKind?: string;
  actorId?: string | null;
}) {
  if (!opts.customerId) return;
  await recordCustomerEvent({
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    eventType: opts.eventType,
    sourceModule: opts.sourceModule,
    sourceEntityId: opts.sourceEntityId,
    title: opts.title,
    metadata: {
      invoiceId: opts.invoiceId ?? null,
      paymentId: opts.paymentId ?? null,
      amount: opts.amount ?? null,
      currency: opts.currency ?? null,
    },
  }).catch(() => undefined);

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: opts.customerId,
    title: opts.title,
    body: opts.body,
    category: "billing",
    deepLink: opts.deepLink ?? "/payments",
    metadata: {
      eventType: opts.eventType,
      invoiceId: opts.invoiceId ?? null,
      paymentId: opts.paymentId ?? null,
    },
  }).catch(() => undefined);
}

export async function ensureLifecycleInvoice(opts: {
  vertical:
    | "accommodation"
    | "dining"
    | "fitness"
    | "spa"
    | "events"
    | "cinema"
    | "commerce";
  tenantId: string;
  customerId: string;
  sourceEntityId: string;
  description: string;
  currency?: string;
  /** Legacy major-unit input (converted explicitly at this boundary). */
  unitAmountMajor?: number;
  /** Integer minor units from catalog / order totals (preferred). */
  unitAmountMinor?: number;
  quantity?: number;
  actorKind?: string;
  actorId?: string | null;
}): Promise<LifecycleBillResult | null> {
  const unitAmount =
    opts.unitAmountMinor ?? majorFloatToMinor(opts.unitAmountMajor ?? 0);
  if (unitAmount <= 0) return null;

  const common = {
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    sourceEntityId: opts.sourceEntityId,
    description: opts.description,
    currency: opts.currency ?? "NGN",
    unitAmount,
    quantity: opts.quantity ?? 1,
    createInvoice: true as const,
    actorKind: opts.actorKind ?? "system",
    actorId: opts.actorId,
  };

  const billers = {
    accommodation: billAccommodation,
    dining: billDining,
    fitness: billFitness,
    spa: billSpa,
    events: billEvents,
    cinema: billCinema,
    commerce: billCommerce,
  } as const;

  const item = await billers[opts.vertical](common);
  const invoiceId = item.invoiceId ?? null;

  if (invoiceId) {
    await emitFinancialSideEffects({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      eventType: "invoice_created",
      title: "Invoice created",
      body: opts.description,
      sourceModule: opts.vertical,
      sourceEntityId: opts.sourceEntityId,
      invoiceId,
      amount: unitAmount * (opts.quantity ?? 1),
      currency: common.currency,
      deepLink: "/invoices",
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    });
  }

  return { billableItemId: item.id, invoiceId };
}

/** Soft-fail wrapper so vertical flows never break on billing errors. */
export async function tryEnsureLifecycleInvoice(
  opts: Parameters<typeof ensureLifecycleInvoice>[0],
): Promise<LifecycleBillResult | null> {
  try {
    return await ensureLifecycleInvoice(opts);
  } catch {
    return null;
  }
}

/**
 * When an invoice reaches paid / partially_paid / open-after-refund,
 * sync vertical billStatus and pending membership activation.
 */
export async function syncVerticalOnInvoicePaid(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true },
  });
  if (!invoice) return;

  for (const line of invoice.lines) {
    if (!line.sourceEntityId || !line.sourceModule) continue;

    if (line.sourceModule === "restaurant" && line.billableType === "RESTAURANT_ORDER") {
      const billStatus =
        invoice.status === "paid"
          ? "paid"
          : invoice.status === "partially_paid"
            ? "partial"
            : invoice.amountPaid > 0 && invoice.status === "open"
              ? "unpaid"
              : invoice.status === "void"
                ? "void"
                : invoice.amountPaid === 0
                  ? "unpaid"
                  : "unpaid";
      // Reflect refunds: if amountPaid is 0 after refunds but was paid, mark refunded when payment refunded
      const payments = await prisma.payment.findMany({
        where: { invoiceId: invoice.id, status: { in: ["refunded", "partially_refunded"] } },
      });
      const fullyRefunded =
        payments.some((p) => p.status === "refunded") && invoice.amountPaid <= 0;
      await prisma.diningOrder
        .updateMany({
          where: { id: line.sourceEntityId, tenantId: invoice.tenantId },
          data: { billStatus: fullyRefunded ? "refunded" : billStatus },
        })
        .catch(() => undefined);
    }

    if (line.sourceModule === "gym_membership" && line.billableType === "FITNESS_MEMBERSHIP") {
      if (invoice.status !== "paid") continue;
      const membership = await prisma.membership.findFirst({
        where: {
          id: line.sourceEntityId,
          tenantId: invoice.tenantId,
          status: "pending",
        },
        include: { plan: true },
      });
      if (!membership) continue;
      const startsAt = new Date();
      const endsAt = new Date(
        startsAt.getTime() + membership.plan.durationDays * 24 * 60 * 60 * 1000,
      );
      await prisma.membership.update({
        where: { id: membership.id },
        data: {
          status: "active",
          startsAt,
          endsAt,
          activatedAt: startsAt,
          periods: {
            create: {
              tenantId: invoice.tenantId,
              startsAt,
              endsAt,
              status: "active",
            },
          },
        },
      });
      await createNotification({
        tenantId: invoice.tenantId,
        actorKind: "guest",
        actorId: membership.customerId,
        title: "Membership activated",
        body: `Your ${membership.plan.name} membership is now active after payment.`,
        category: "billing",
        deepLink: "/fitness/membership",
        metadata: { membershipId: membership.id, invoiceId: invoice.id },
      }).catch(() => undefined);
    }
  }
}

/** Notify guest + CRM when a payment is captured / receipt issued. */
export async function emitPaymentReceived(opts: {
  tenantId: string;
  customerId?: string | null;
  paymentId: string;
  invoiceId?: string | null;
  amount: number;
  currency: string;
  methodType: string;
  receiptNumber?: string | null;
}) {
  await emitFinancialSideEffects({
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    eventType: "payment_received",
    title: "Payment received",
    body: `Payment of ${opts.amount} ${opts.currency} via ${opts.methodType.replaceAll("_", " ")}${
      opts.receiptNumber ? ` · Receipt ${opts.receiptNumber}` : ""
    }`,
    sourceModule: "billing",
    sourceEntityId: opts.paymentId,
    invoiceId: opts.invoiceId,
    paymentId: opts.paymentId,
    amount: opts.amount,
    currency: opts.currency,
    deepLink: "/receipts",
  });
}

export async function emitPaymentVerified(opts: {
  tenantId: string;
  customerId?: string | null;
  paymentId: string;
  invoiceId?: string | null;
  amount: number;
  currency: string;
}) {
  await emitFinancialSideEffects({
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    eventType: "payment_verified",
    title: "Payment verified",
    body: `Your payment of ${opts.amount} ${opts.currency} was verified.`,
    sourceModule: "billing",
    sourceEntityId: opts.paymentId,
    invoiceId: opts.invoiceId,
    paymentId: opts.paymentId,
    amount: opts.amount,
    currency: opts.currency,
    deepLink: "/receipts",
  });
}

export async function emitRefundIssued(opts: {
  tenantId: string;
  customerId?: string | null;
  paymentId: string;
  refundId: string;
  amount: number;
  currency: string;
  reason?: string | null;
}) {
  await emitFinancialSideEffects({
    tenantId: opts.tenantId,
    customerId: opts.customerId,
    eventType: "refund_issued",
    title: "Refund issued",
    body: `Refund of ${opts.amount} ${opts.currency}${opts.reason ? `: ${opts.reason}` : ""}`,
    sourceModule: "billing",
    sourceEntityId: opts.refundId,
    paymentId: opts.paymentId,
    amount: opts.amount,
    currency: opts.currency,
    deepLink: "/activity",
  });
}

/** Explicit payment status transitions (server-side). */
const PAYMENT_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["authorized", "captured", "pending_verification", "failed", "cancelled"],
  authorized: ["captured", "cancelled", "failed"],
  pending_verification: ["captured", "failed", "cancelled"],
  captured: ["partially_refunded", "refunded"],
  partially_refunded: ["refunded", "partially_refunded"],
  requires_action: ["captured", "failed", "cancelled"],
  failed: [],
  cancelled: [],
  refunded: [],
};

export function assertPaymentTransition(from: string, to: string) {
  const allowed = PAYMENT_TRANSITIONS[from];
  if (!allowed) {
    throw Object.assign(new Error(`Unknown payment status ${from}`), {
      code: "invalid_state",
      statusCode: 400,
    });
  }
  if (!allowed.includes(to)) {
    throw Object.assign(new Error(`Invalid payment transition ${from} → ${to}`), {
      code: "invalid_state",
      statusCode: 400,
    });
  }
}

export async function getGuestActivity(opts: {
  tenantId: string;
  customerId: string;
}) {
  const [
    reservations,
    bookings,
    spa,
    memberships,
    eventTickets,
    cinemaTickets,
    orders,
    invoices,
    payments,
    receipts,
    refunds,
  ] = await Promise.all([
    prisma.accommodationReservation.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.booking.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.spaAppointment.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { startsAt: "desc" },
      take: 30,
      include: { treatment: { select: { name: true } } },
    }),
    prisma.membership.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { plan: { select: { name: true } } },
    }),
    prisma.eventTicket.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { bookedAt: "desc" },
      take: 30,
      include: { event: { select: { name: true } } },
    }),
    prisma.cinemaTicket.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { bookedAt: "desc" },
      take: 30,
      include: { showtime: { include: { content: { select: { title: true } } } } },
    }),
    prisma.diningOrder.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.invoice.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.payment.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.receipt.findMany({
      where: { tenantId: opts.tenantId, customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.refund.findMany({
      where: { tenantId: opts.tenantId, payment: { customerId: opts.customerId } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  type ActivityItem = {
    id: string;
    category: string;
    title: string;
    status: string;
    at: string;
    href: string;
    amount?: number;
    currency?: string;
  };

  const items: ActivityItem[] = [];

  for (const r of reservations) {
    items.push({
      id: r.id,
      category: "reservation",
      title: `Stay ${r.confirmationCode}`,
      status: r.status,
      at: r.createdAt.toISOString(),
      href: "/bookings",
    });
  }
  for (const b of bookings) {
    items.push({
      id: b.id,
      category: "booking",
      title: b.confirmationCode,
      status: b.status,
      at: b.createdAt.toISOString(),
      href: "/engine/bookings",
    });
  }
  for (const a of spa) {
    items.push({
      id: a.id,
      category: "appointment",
      title: a.treatment.name,
      status: a.status,
      at: a.startsAt.toISOString(),
      href: "/spa/appointments",
    });
  }
  for (const m of memberships) {
    items.push({
      id: m.id,
      category: "membership",
      title: m.plan.name,
      status: m.status,
      at: m.createdAt.toISOString(),
      href: "/fitness/membership",
    });
  }
  for (const t of eventTickets) {
    items.push({
      id: t.id,
      category: "ticket",
      title: t.event?.name ?? "Event ticket",
      status: t.status,
      at: t.bookedAt.toISOString(),
      href: "/events/tickets",
    });
  }
  for (const t of cinemaTickets) {
    items.push({
      id: t.id,
      category: "ticket",
      title: t.showtime?.content?.title ?? "Cinema ticket",
      status: t.status,
      at: t.bookedAt.toISOString(),
      href: "/cinema/tickets",
    });
  }
  for (const o of orders) {
    items.push({
      id: o.id,
      category: "order",
      title: `Order ${o.id.slice(0, 8)}`,
      status: o.billStatus === "paid" ? "paid" : o.status,
      at: o.createdAt.toISOString(),
      href: "/dining",
      amount: o.total,
      currency: "NGN",
    });
  }
  for (const inv of invoices) {
    items.push({
      id: inv.id,
      category: "invoice",
      title: inv.number,
      status: inv.status,
      at: inv.createdAt.toISOString(),
      href: "/invoices",
      amount: inv.amountDue > 0 ? inv.amountDue : inv.total,
      currency: inv.currency,
    });
  }
  for (const p of payments) {
    items.push({
      id: p.id,
      category: "payment",
      title: `${p.methodType.replaceAll("_", " ")}`,
      status: p.status,
      at: p.createdAt.toISOString(),
      href: "/payments",
      amount: p.amount,
      currency: p.currency,
    });
  }
  for (const r of receipts) {
    items.push({
      id: r.id,
      category: "receipt",
      title: r.number,
      status: "issued",
      at: r.createdAt.toISOString(),
      href: "/receipts",
      amount: r.amount,
      currency: r.currency,
    });
  }
  for (const r of refunds) {
    items.push({
      id: r.id,
      category: "refund",
      title: "Refund",
      status: r.status,
      at: r.createdAt.toISOString(),
      href: "/activity",
      amount: r.amount,
      currency: r.currency,
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { items: items.slice(0, 100) };
}
