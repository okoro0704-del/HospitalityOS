# Delivery Providers

## Interface

```ts
interface NotificationProvider {
  channel: string;
  send(message: OutboundMessage): Promise<ProviderResult>;
}
```

## Sprint 12 providers

| Provider | Behavior |
|----------|----------|
| InAppProvider | Persists Notification row; adapter returns delivered |
| EmailProvider | Mock send; returns `email_mock` external id |
| SmsProvider | Mock send |
| PushProvider | Mock send |
| WhatsApp | Interface only — not registered |

## Delivery statuses

`pending` → `processing` → `sent` / `delivered` / `failed` / `skipped` / `blocked` / `cancelled`

Future real providers plug in by implementing `NotificationProvider` without changing the core engine.
