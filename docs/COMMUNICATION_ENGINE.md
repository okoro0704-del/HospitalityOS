# Communication Engine

## Architecture

Provider-independent pipeline:

1. **CommunicationEvent** — normalized platform event (`tenantId`, `eventType`, `sourceModule`, `sourceEntityId`, …)
2. **NotificationRule** — maps event → template, channels, audience, delay
3. **NotificationTemplate** — versioned subject/body with safe variables
4. **Channel adapters** — `InAppProvider`, `EmailProvider` (mock), `SmsProvider` (mock), `PushProvider` (mock)
5. **NotificationDelivery** — attempt log + status
6. **CommunicationLog / NotificationAuditEvent** — audit trail

Implementation: `apps/api/src/services/communications/`.

## Idempotency

Deliveries use a unique key:

`sha256(tenant|eventType|sourceEntity|recipientKind|recipientId|ruleId|channel)`

Duplicate event processing reuses the existing delivery and does not create another in-app message for the same key.

## Scheduling

`NotificationSchedule` holds delayed work (`delayMinutes` on rules). `processDueSchedules()` is the worker abstraction — synchronous today, queue-ready later.

## Retries

Failed deliveries support bounded retries (`attemptCount` / `maxAttempts`). Infinite loops are not allowed.

## Consent

Marketing templates/rules check CRM `CustomerConsent` and channel marketing prefs before send. Blocks are recorded as `status=blocked`.

## Vertical adapters

`verticals.ts` exposes `emitFromAccommodation`, `emitFromDining`, `emitFromFitness`, `emitFromSpa`, `emitFromEvents`, `emitFromCinema`, `emitFromOperations`, `emitFromCrm`.
