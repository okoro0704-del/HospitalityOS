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

Still out of scope:

- Payments, accounting, token integration
- POS / turnstile / biometric access hardware
- LifeOS Business Portal staff SSO
- White-label custom domains
