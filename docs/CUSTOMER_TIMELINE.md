# Customer Timeline

## Purpose

One chronological view of a customer’s relationship with the tenant across all HospitalityOS verticals.

## Event shape (`CustomerEvent` + projected items)

| Field | Description |
|-------|-------------|
| tenantId | Isolation boundary |
| customerId | CRM customer |
| eventType | e.g. `BOOKING_CREATED`, `ORDER_COMPLETED` |
| sourceModule | Module id (`accommodation`, `cinema`, …) |
| sourceEntityId | Id of the underlying record |
| timestamp / occurredAt | When it happened |
| metadata | Small JSON context (status, etc.) |

## Event types (foundation)

`BOOKING_CREATED`, `BOOKING_CANCELLED`, `STAY_COMPLETED`, `ORDER_COMPLETED`, `MEMBERSHIP_STARTED`, `SPA_APPOINTMENT_COMPLETED`, `EVENT_ATTENDED`, `CINEMA_TICKET_USED`, `FEEDBACK`, `INTERACTION`, `CUSTOM`, …

## Providers

`collectVerticalTimeline` in `apps/api/src/services/crm.ts` acts as the shared interface. Verticals contribute by:

1. Writing durable records in their own tables (preferred), and/or
2. Calling `recordCustomerEvent` for CRM-owned events (interactions, feedback, custom).

Operations and future notification services should consume this interface — **not** import every vertical service.

## Notification extension points

Future communications can subscribe to:

- Customer events / timeline items
- CustomerCommunicationPreference
- CustomerConsent
- Preferred contact channels

No delivery infrastructure ships in Sprint 11.
