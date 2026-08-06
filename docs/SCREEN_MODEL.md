# Screen Model

A **CinemaVenue** contains one or more **CinemaScreen** rows.

## Screen fields

- Name, code, screen type (`standard`, `premium`, `imax`, `vip`, `private`, `outdoor`, `other`)
- Capacity, amenities, status
- Seating mode (`assigned` | `general_admission`)
- `bookableResourceId` — Booking Engine resource (`moduleId: cinema`, `sourceType: cinema_screen`)

## Integration

Creating a screen calls `ensureScreenResource`, which upserts a bookable resource in the `entertainment` category. Showtimes then book that screen resource for the show window so overlapping showtimes on the same screen are rejected by the Booking Engine.
