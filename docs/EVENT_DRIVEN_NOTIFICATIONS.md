# Event-Driven Notifications

## CommunicationEvent

| Field | Purpose |
|-------|---------|
| tenantId | Isolation |
| eventType | e.g. `BOOKING_CONFIRMED` |
| sourceModule | Vertical module id |
| sourceEntityId | Underlying record |
| customerId / staffUserId | Recipients |
| metadata / variables | Template context |

## Flow

```text
BOOKING_CONFIRMED
  → matching NotificationRule(s)
  → render template
  → deliver on configured channels (in_app, email, …)
```

## Example event types

Booking/reservation, order ready, membership, event/cinema tickets, inventory low, maintenance, CRM feedback request.

Verticals should emit normalized events via adapters — not build separate notification engines.
