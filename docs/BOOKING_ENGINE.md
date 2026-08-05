# Universal Booking Engine

HospitalityOS uses **one** booking & scheduling engine for every reservable service. Modules (Accommodation today; Restaurant, Gym, Spa, Salon, Events, Cinema later) do not implement their own booking stacks — they register bookable resources and call shared services.

## Architecture

```text
Module (Accommodation / future)
        │
        ▼
┌───────────────────────────────────────┐
│  Booking Engine services              │
│  createBooking · availability ·       │
│  conflict · waitlist · calendar ·     │
│  policies · schedules                 │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│  Tenant-scoped domain tables          │
│  BookableResource · Booking · Item ·  │
│  Schedule · Blackout · Policy · …     │
└───────────────────────────────────────┘
```

Core implementation:

| Layer | Location |
|-------|----------|
| Domain models | `apps/api/prisma/schema.prisma` |
| Engine services | `apps/api/src/services/booking-engine.ts` |
| REST API | `apps/api/src/routes-booking.ts` |
| Shared enums/DTOs | `packages/shared` (`BOOKING_STATUSES`, …) |
| Staff UI | `apps/staff-web/src/pages/booking/*` |
| Guest UI | `apps/guest-pwa` `/book`, `/my-bookings` |

## Booking lifecycle

Statuses (shared):

`draft` → `pending` → `confirmed` → `checked_in` → `checked_out` / `completed`

Also: `cancelled`, `expired`, `no_show`, `waitlisted`

Blocking statuses for capacity/conflict: `pending`, `confirmed`, `checked_in`.

## Responsibilities

1. **Create / update / cancel / transition** bookings with items pointing at resources.
2. **Validate policies** (notice, advance window, duration min/max).
3. **Detect conflicts** (capacity, blackouts, holidays, unavailable resources).
4. **Waitlist** join + basic promotion when capacity frees.
5. **Timeline + audit + in-app notifications** for lifecycle events.
6. **Calendar projections** for day/week/month/timeline/agenda/resource/branch views.

## Accommodation integration

Accommodation remains the guest-facing stay product. Internally:

1. Rooms sync to `BookableResource` (`sourceType: accommodation_room`).
2. Creating a reservation creates a linked `Booking` (`AccommodationReservation.bookingId`).
3. Check-in / check-out / cancel transition the linked booking.
4. Overnight stays use `skipPolicy: true` so engine duration policies do not block multi-night stays (accommodation has its own stay rules).

User-facing accommodation APIs and UIs are unchanged.

## Future modules

A new vertical plugs in by:

1. Defining resources under a `ResourceCategory` + `moduleId`.
2. Calling `createBooking` / `checkAvailability` (or REST `/booking/*`).
3. Optionally binding module entities via `sourceType` / `sourceId` on resources.

No schema redesign is required for new resource types (types are data, not enums).

## Out of scope (Sprint 3)

Restaurant ordering, gym memberships, spa treatments, cinema ticketing, event management, payments, accounting, inventory, CRM, Business Portal.
