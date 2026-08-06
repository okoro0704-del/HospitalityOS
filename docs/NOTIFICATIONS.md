# Notifications

HospitalityOS provides **one shared communications engine** for all verticals.

## Lifecycle

```text
CommunicationEvent → NotificationRule → Template → Channel Adapter → Delivery
```

## Channels (Sprint 12)

| Channel | Status |
|---------|--------|
| In-app | Functional |
| Email | Mock provider |
| SMS | Mock provider |
| Push | Mock provider |
| WhatsApp | Interface only |

## Audiences

Customer and staff notifications are **never mixed**. Guest APIs only return `audience=customer`. Staff APIs only return `audience=staff`.

## Surfaces

- Guest PWA: `/notifications`
- Staff Web: `/notifications`, templates, rules, deliveries, preferences

## Related docs

- [COMMUNICATION_ENGINE.md](./COMMUNICATION_ENGINE.md)
- [NOTIFICATION_TEMPLATES.md](./NOTIFICATION_TEMPLATES.md)
- [COMMUNICATION_PREFERENCES.md](./COMMUNICATION_PREFERENCES.md)
- [DELIVERY_PROVIDERS.md](./DELIVERY_PROVIDERS.md)
- [EVENT_DRIVEN_NOTIFICATIONS.md](./EVENT_DRIVEN_NOTIFICATIONS.md)
