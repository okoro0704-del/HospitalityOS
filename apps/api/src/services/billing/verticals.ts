/**
 * Vertical → billing adapters. Produce BillableItems / invoices without
 * duplicating commerce pricing — callers pass final amounts in minor units.
 */
import { recordBillableItem } from "./engine.js";

type Common = {
  tenantId: string;
  customerId: string;
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
};

export function billAccommodation(opts: Common) {
  return recordBillableItem({
    ...opts,
    billableType: "ACCOMMODATION_RESERVATION",
    sourceModule: "accommodation",
  });
}

export function billDining(opts: Common) {
  return recordBillableItem({
    ...opts,
    billableType: "RESTAURANT_ORDER",
    sourceModule: "restaurant",
  });
}

export function billFitness(opts: Common) {
  return recordBillableItem({
    ...opts,
    billableType: "FITNESS_MEMBERSHIP",
    sourceModule: "gym_membership",
  });
}

export function billSpa(opts: Common) {
  return recordBillableItem({
    ...opts,
    billableType: "SPA_APPOINTMENT",
    sourceModule: "spa_services",
  });
}

export function billEvents(opts: Common) {
  return recordBillableItem({
    ...opts,
    billableType: "EVENT_TICKET",
    sourceModule: "events",
  });
}

export function billCinema(opts: Common) {
  return recordBillableItem({
    ...opts,
    billableType: "CINEMA_TICKET",
    sourceModule: "cinema",
  });
}

export function billCommerce(opts: Common & { billableType?: "COMMERCE_ORDER" | "PRODUCT_PURCHASE" | "PACKAGE_PURCHASE" }) {
  return recordBillableItem({
    ...opts,
    billableType: opts.billableType ?? "COMMERCE_ORDER",
    sourceModule: "commerce",
  });
}
