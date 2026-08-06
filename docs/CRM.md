# CRM & Customer Management Foundation

HospitalityOS provides **one shared CRM** for every vertical. Businesses manage a unified relationship with each customer across accommodation, dining, fitness, spa, events, cinema, and future modules.

## Architecture

```text
Vertical modules ──► timeline providers ──► Customer timeline
                         │
Staff Web / Guest PWA ──► CRM API (tenant-scoped) ──► Customer + satellites
                         │
                    AuditLog + CustomerEvent
```

- **Module:** `customer_management` (v2) — gates advanced CRM (tags, notes, consent, segments, loyalty, merge).
- **Basic** `GET/POST /customers` and `GET /search/customers` remain available for platform compatibility even when advanced CRM features are gated.
- **Not an identity provider.** TrustID / LifeOS remain the ecosystem identity layer.

## Identity boundary

| Concern | Owner |
|---------|--------|
| Authentication, passkeys, biometrics, ID verification | TrustID / LifeOS |
| Business relationship, preferences, notes, consent | HospitalityOS CRM |
| Optional TrustID / LifeOS reference | `externalIdentityRef`, `trustId`, `lifeosUserId` |

A customer may exist **without** a TrustID reference. Credentials and verification secrets are never stored in CRM.

## Vertical integration

`collectVerticalTimeline` aggregates references from:

| Provider | Source records |
|----------|----------------|
| Accommodation | Stays, bookings |
| Restaurant | Dining reservations |
| Fitness | Memberships |
| Spa | Spa appointments |
| Events | Event tickets |
| Cinema | Cinema tickets |
| CRM | Stored `CustomerEvent`, interactions, feedback |

Transactions are **referenced**, not duplicated.

## Staff surfaces

| Route | Purpose |
|-------|---------|
| `/customers` | Search & list |
| `/customers/:id` | Full profile + timeline + notes |
| `/customers/segments` | Rule-based segments |
| `/customers/tags` | Tenant tags |
| `/customers/interactions` | Interaction entry (via profile) |
| `/customers/feedback` | Feedback entry point |
| `/customers/consent` | Consent management entry |
| `/customers/loyalty` | Loyalty foundation |

## Guest surfaces

Guest PWA `/profile` exposes profile, preferences, timeline, feedback, and loyalty status. Guests **never** see internal notes, tags, segments, or staff-only interactions.

## Merge

`POST /customers/merge` requires `confirmed: true`. Staff UI remains disabled until product enables it.

## Related docs

- [CUSTOMER_MODEL.md](./CUSTOMER_MODEL.md)
- [CUSTOMER_TIMELINE.md](./CUSTOMER_TIMELINE.md)
- [CUSTOMER_PRIVACY.md](./CUSTOMER_PRIVACY.md)
- [CUSTOMER_SEGMENTS.md](./CUSTOMER_SEGMENTS.md)
- [CUSTOMER_LOYALTY.md](./CUSTOMER_LOYALTY.md)
