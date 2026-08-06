/**
 * Vertical adapters — emit normalized CommunicationEvents.
 * Verticals should call these instead of building parallel notification systems.
 */
import { processCommunicationEvent } from "./engine.js";

export async function emitFromAccommodation(opts: {
  tenantId: string;
  eventType: "STAY_BOOKED" | "CHECKIN_REMINDER" | "CHECKOUT_REMINDER" | "BOOKING_CONFIRMED" | "BOOKING_CANCELLED";
  customerId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "accommodation",
    sourceEntityId: opts.sourceEntityId,
    customerId: opts.customerId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}

export async function emitFromDining(opts: {
  tenantId: string;
  eventType: "RESTAURANT_RESERVATION_CONFIRMED" | "ORDER_READY" | "ORDER_CREATED";
  customerId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "restaurant",
    sourceEntityId: opts.sourceEntityId,
    customerId: opts.customerId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}

export async function emitFromFitness(opts: {
  tenantId: string;
  eventType: "CLASS_REMINDER" | "MEMBERSHIP_STARTED" | "MEMBERSHIP_EXPIRING";
  customerId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "gym_membership",
    sourceEntityId: opts.sourceEntityId,
    customerId: opts.customerId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}

export async function emitFromSpa(opts: {
  tenantId: string;
  eventType: "APPOINTMENT_REMINDER" | "AFTERCARE_AVAILABLE";
  customerId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "spa_services",
    sourceEntityId: opts.sourceEntityId,
    customerId: opts.customerId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}

export async function emitFromEvents(opts: {
  tenantId: string;
  eventType: "EVENT_TICKET_BOOKED" | "EVENT_REMINDER" | "TICKET_CONFIRMED";
  customerId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "events",
    sourceEntityId: opts.sourceEntityId,
    customerId: opts.customerId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}

export async function emitFromCinema(opts: {
  tenantId: string;
  eventType: "SHOWTIME_REMINDER" | "TICKET_CONFIRMED" | "CINEMA_SHOWTIME_REMINDER";
  customerId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "cinema",
    sourceEntityId: opts.sourceEntityId,
    customerId: opts.customerId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}

export async function emitFromOperations(opts: {
  tenantId: string;
  eventType: "LOW_STOCK" | "INVENTORY_LOW" | "MAINTENANCE_CREATED" | "MAINTENANCE_ASSIGNED" | "PURCHASE_REQUEST_CREATED";
  staffUserId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "inventory",
    sourceEntityId: opts.sourceEntityId,
    staffUserId: opts.staffUserId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}

export async function emitFromCrm(opts: {
  tenantId: string;
  eventType: "FEEDBACK_REQUEST";
  customerId?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  return processCommunicationEvent({
    tenantId: opts.tenantId,
    eventType: opts.eventType,
    sourceModule: "customer_management",
    sourceEntityId: opts.sourceEntityId,
    customerId: opts.customerId,
    deepLink: opts.deepLink,
    variables: opts.variables,
    metadata: opts.metadata,
  });
}
