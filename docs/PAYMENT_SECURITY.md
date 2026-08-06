# Payment Security

Never store raw card numbers, CVVs, bank passwords, or provider secrets in the database or Guest PWA.

Store provider token references / `providerRef` only.

Payment success is **server/provider authoritative** — never trust client-only confirmation.

Webhook processing is idempotent (`provider` + `eventId`).

Tenant isolation is absolute on every financial query.
