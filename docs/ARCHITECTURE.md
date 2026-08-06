# HospitalityOS Architecture

## Vision

HospitalityOS is the operating system for hospitality, leisure, tourism, and experiences. A single codebase serves many business types through a **module registry** and **multi-tenant** isolation.

```text
                    ┌─────────────────────────────────────┐
                    │           HospitalityOS             │
                    │  ┌─────────┐  ┌──────────────────┐  │
 Guests ───────────►│  │Guest PWA│  │   Staff Web      │  │
 (via LifeOS)       │  └────┬────┘  └────────┬─────────┘  │
                    │       │                │            │
                    │       ▼                ▼            │
                    │  ┌──────────────────────────────┐   │
                    │  │     HospitalityOS API        │   │
                    │  │  tenants · modules · auth    │   │
                    │  │  customers · staff · audit   │   │
                    │  └──────────────┬───────────────┘   │
                    │                 ▼                   │
                    │         SQLite / Prisma DB          │
                    └─────────────────────────────────────┘
                              ▲
                              │ experience-session protocol
                    ┌─────────┴─────────┐
                    │      LifeOS       │
                    └─────────┬─────────┘
                              │ OAuth / identity
                    ┌─────────┴─────────┐
                    │     TrustID       │
                    └───────────────────┘
```

## Design principles

1. **One product** — no per-vertical forks (HotelOS, GymOS, …).
2. **Modules as plugins** — tenants enable only what they need.
3. **Tenant isolation** — every row is scoped; cross-tenant access returns `404`.
4. **OS-owned sessions** — after LifeOS handoff, HospitalityOS issues its own session.
5. **Independent deployability** — own DB, API, frontends, CI/CD.

## Runtime components

| Component | Responsibility |
|-----------|----------------|
| `apps/api` | Multi-tenant API, auth, module registry, branding |
| `apps/guest-pwa` | Customer shell; LifeOS handoff receiver |
| `apps/staff-web` | Operations shell; local staff auth (Business Portal later) |
| `packages/shared` | Module catalog, shared DTOs |

## Request context

Authenticated requests resolve:

```text
auth.kind: guest | staff
auth.tenantId: immutable tenant boundary
auth.actorId: customerId | staffId
auth.role: (staff only)
```

All data queries **must** include `tenantId` from this context — never from client-supplied body fields alone.

## Sprint 1 boundary

Implemented:

- Tenants, branches, branding, operating hours
- Module catalog + per-tenant enable/disable
- Customers & staff records (CRUD shells)
- Guest experience-session exchange
- Staff login + roles
- Notifications & audit log shells
- Health + validation

## Sprint 2 — Accommodation

Implemented as a **module-gated** domain (`accommodation`):

- Properties, room types, rooms, amenities, rate plans
- Reservation lifecycle + timeline
- Check-in / check-out + stays
- Housekeeping & maintenance affecting availability
- Calendar (daily / weekly / monthly)
- Guest PWA browse + reserve
- Staff Web operational screens

## Sprint 3 — Universal Booking & Scheduling Engine

Shared backbone for every reservable service:

- Generic `BookableResource` + categories (no hard-coded resource types)
- Booking lifecycle, items, timeline, reminders
- Availability / conflict / capacity / blackout / holiday checks
- Schedules, policies, waitlists, calendar projections
- Staff Web booking surfaces + Guest PWA `/book` + `/my-bookings`
- Accommodation reservations link to engine bookings internally

See [BOOKING_ENGINE.md](./BOOKING_ENGINE.md), [SCHEDULING_ENGINE.md](./SCHEDULING_ENGINE.md), [RESOURCE_MODEL.md](./RESOURCE_MODEL.md), [API_BOOKING.md](./API_BOOKING.md).

## Sprint 4 — Universal Commerce & Catalog Engine

Commercial backbone shared by every module:

- Catalog with nested categories
- Offerings: service / product / package
- Pricing rules, promotions, coupons
- Media, add-ons, upsells, sales channels
- Service booking via AvailabilityLink → Booking Engine
- Staff `/commerce/*` and Guest `/catalog`

See [CATALOG_ENGINE.md](./CATALOG_ENGINE.md), [COMMERCE_ENGINE.md](./COMMERCE_ENGINE.md), [PRICING_ENGINE.md](./PRICING_ENGINE.md).

## Sprint 5 — Restaurant & Dining

Module-gated dining ops on top of Booking + Commerce:

- Dining areas, tables (bookable resources), reservations
- Menus / sections / items → commerce offerings
- Orders, kitchen tickets, shifts
- Guest menu browse + table reserve / waitlist

See [RESTAURANT_MODULE.md](./RESTAURANT_MODULE.md).

## Sprint 6 — Gym, Fitness & Membership

Module-gated fitness ops on Booking + Commerce:

- Facilities / areas, membership plans & lifecycle
- Classes → bookable resources; trainers → PT bookings
- Attendance, check-ins, day/guest/trial passes
- Staff `/fitness/*` and Guest `/fitness/*`

See [GYM_MODULE.md](./GYM_MODULE.md), [MEMBERSHIP_MODEL.md](./MEMBERSHIP_MODEL.md), [FITNESS_BOOKING.md](./FITNESS_BOOKING.md).

## Sprint 7 — Spa & Wellness

Module-gated spa ops on Booking + Commerce:

- Treatments / variants → commerce offerings
- Therapists & rooms → bookable resources; appointments → Booking
- Wellness facility sessions, packages, memberships
- Role-gated consultations & treatment notes
- Staff `/spa/*` and Guest `/spa/*`

See [SPA_MODULE.md](./SPA_MODULE.md), [SPA_BOOKING.md](./SPA_BOOKING.md), [TREATMENT_CATALOG.md](./TREATMENT_CATALOG.md).

## Sprint 8 — Events & Venues

Module-gated events ops on Booking + Commerce:

- Venues / areas → bookable resources; venue rental → Booking
- Events, sessions, ticket types → Commerce products
- Atomic capacity + seat claims for oversale protection
- Staff `/events/*` and Guest `/events/*`

See [EVENTS_MODULE.md](./EVENTS_MODULE.md), [TICKETING.md](./TICKETING.md), [SEATING.md](./SEATING.md).

## Sprint 9 — Cinema & Entertainment

Module-gated cinema ops on Booking + Commerce:

- Screens → bookable resources; showtimes reserve screens via Booking
- Ticket types & concessions → Commerce offerings
- Assigned seating, temporary holds, atomic last-seat/ticket protection
- Staff `/cinema/*` and Guest `/cinema/*`

See [CINEMA_MODULE.md](./CINEMA_MODULE.md), [SHOWTIME_MODEL.md](./SHOWTIME_MODEL.md), [SEAT_HOLDS.md](./SEAT_HOLDS.md).

## Sprint 10 — Operations & Inventory

Shared operational foundation (not an ERP):

- Locations, items, balances, transactions, transfers, stock counts
- Reorder alerts, suppliers, purchase requests
- Assets, maintenance, operational tasks
- Optional Commerce product → inventory item link
- Staff `/operations/*` (no guest inventory UI)

See [OPERATIONS.md](./OPERATIONS.md), [INVENTORY.md](./INVENTORY.md), [INVENTORY_TRANSACTIONS.md](./INVENTORY_TRANSACTIONS.md).

## Sprint 11 — CRM & Customer Management

Shared customer relationship layer (not an identity provider):

- Unified `Customer` + preferences, tags, notes, consent, segments
- Cross-vertical timeline via providers (bookings, stays, dining, spa, events, cinema)
- Loyalty foundation without token integration
- Staff `/customers/*` and Guest `/profile`
- TrustID/LifeOS references only (`externalIdentityRef` / `trustId` / `lifeosUserId`)

See [CRM.md](./CRM.md), [CUSTOMER_MODEL.md](./CUSTOMER_MODEL.md), [CUSTOMER_TIMELINE.md](./CUSTOMER_TIMELINE.md), [CUSTOMER_PRIVACY.md](./CUSTOMER_PRIVACY.md).

## Sprint 12 — Communications & Notifications

Shared communications engine (not per-vertical inboxes):

- Event → rule → template → channel adapter → delivery
- Functional in-app; mock email/SMS/push; WhatsApp interface only
- Consent + preference enforcement for marketing
- Idempotent deliveries, schedules, bounded retries
- Staff `/notifications/*` and Guest `/notifications`

See [NOTIFICATIONS.md](./NOTIFICATIONS.md), [COMMUNICATION_ENGINE.md](./COMMUNICATION_ENGINE.md), [EVENT_DRIVEN_NOTIFICATIONS.md](./EVENT_DRIVEN_NOTIFICATIONS.md).

## Sprint 13 — Payments & Billing

Shared billing foundation (not per-vertical payment systems):

- Commerce → billable items → invoice → payment intent → provider → payment → settlement
- Integer minor-unit money + multi-currency
- Mock provider; card/bank/wallet/token interfaces for future adapters
- Cash, refunds, receipts, tax rules, credit notes, webhook idempotency
- Staff `/billing/*` and Guest `/payments`, `/invoices`, `/receipts`

See [PAYMENTS.md](./PAYMENTS.md), [BILLING.md](./BILLING.md), [PAYMENT_PROVIDERS.md](./PAYMENT_PROVIDERS.md), [PAYMENT_SECURITY.md](./PAYMENT_SECURITY.md).

Still out of scope:

- Real card/bank/mobile-money processors
- Cryptocurrency / token network / blockchain
- Full accounting ledger / payroll
- Complex tax compliance engines
- Authentication / identity verification
- LifeOS Business Portal staff SSO
- White-label custom domains
