# Accommodation Module (Sprint 2)

## Scope

The **Accommodation** module powers hotels, resorts, apartments, guest houses, hostels, vacation rentals, and short-lets from one configurable domain.

Tenants without the `accommodation` module enabled receive `404 module_disabled` on all accommodation routes.

## Domain model

```text
Tenant
 └── Property (1..n)
      ├── Building? / Floor?
      ├── Amenity (catalog)
      ├── RoomType ── amenities, photos, base rate
      ├── RatePlan
      ├── Room (HK + maintenance + occupancy)
      └── Reservation
           ├── ReservationGuest
           ├── ReservationTimeline
           └── Stay (created at check-in)
```

Guest profiles reuse `Customer` with:

- `lifeosUserId` / `trustId` when available
- `preferences` JSON
- `loyaltyPlaceholder` JSON
- `GuestNote` staff notes
- stay history via reservations

## Reservation lifecycle

```text
draft → pending → confirmed → checked_in → checked_out
                 ↘ cancelled
                 ↘ no_show
```

Blocking inventory statuses: `pending`, `confirmed`, `checked_in`.

## Check-in / check-out

| Action | Effects |
|--------|---------|
| Check-in | Assign room, start `Stay`, room → occupied, HK → dirty |
| Check-out | End stay, reservation → checked_out, room → vacant + dirty |

No billing in Sprint 2.

## Housekeeping

`clean` · `dirty` · `in_progress` · `inspected` · `out_of_service`

`out_of_service` rooms cannot be reserved.

## Maintenance

`available` · `scheduled` · `under_maintenance` · `blocked`

`under_maintenance` and `blocked` prevent new reservations.

## Calendar

`GET /accommodation/calendar?propertyId=&view=daily|weekly|monthly&date=`

Returns room rows, reservation overlays, and check-in/out flags for the range.

## Guest PWA

- Browse properties / room types
- Availability check
- Create reservation (maps to LifeOS-linked customer)
- View upcoming + history
- Cancel eligible reservations

## Staff Web

Navigation (when module enabled): Properties, Room Types, Rooms, Reservations, Calendar, Guests, Housekeeping, Maintenance.
