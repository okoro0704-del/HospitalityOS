# Customer Model

## Customer (unified record)

Tenant-scoped core profile:

| Field | Notes |
|-------|--------|
| displayName | Required |
| firstName / lastName / preferredName | Optional |
| email / phone | Optional contact |
| dateOfBirth / gender | Optional; minimize collection |
| preferredLanguage / timezone | Service delivery |
| status | `active` \| `blocked` \| `inactive` |
| lifeosUserId / trustId / externalIdentityRef | External identity refs only |
| preferences / loyaltyPlaceholder / metadata | JSON bags |

## Satellite models

| Model | Role |
|-------|------|
| CustomerContact | Multiple emails/phones + preferred method |
| CustomerAddress | Home / work / billing / other (optional) |
| CustomerPreference | Module-scoped key/value (`moduleId` + `key`) |
| CustomerTag / CustomerTagLink | Tenant-specific tags (VIP, Corporate, …) |
| CustomerNote | Staff notes; visibility `internal` \| `restricted` |
| CustomerConsent | Purpose + granted/withdrawn + policy/version |
| CustomerSegment | Rule-based segment definitions |
| CustomerInteraction | Phone, email, in-person, follow-up |
| CustomerEvent | Normalized CRM events |
| CustomerVisit | Normalized visit references |
| CustomerFeedback / CustomerReview | Ratings & moderation |
| CustomerLoyaltyProfile | Tier / points placeholder |
| CustomerCommunicationPreference | Channel opt-ins (extension for notifications) |
| CustomerMergeRequest | Explicit merge audit |
| CustomerRelationship | Soft links (family, corporate) within a tenant |

## Non-duplication

Bookings, orders, memberships, tickets, and stays continue to live in their vertical schemas. CRM timeline and visit models **point at** those records via `sourceModule` + `sourceEntityId`.

## TrustID reference

```text
Customer.externalIdentityRef  →  TrustID / LifeOS subject (opaque)
Customer.trustId              →  optional TrustID handle
Customer.lifeosUserId         →  LifeOS user id for experience sessions
```

This is not a copy of TrustID’s identity database.
