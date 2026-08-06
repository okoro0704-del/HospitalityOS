# Venue Model

## EventVenue

Configurable halls/spaces: type, capacity, location, amenities, images, status.

Reservable venues get a Booking Engine resource (`sourceType: event_venue`, `moduleId: venue_booking`).

## VenueArea

Nested spaces under a venue (ballroom, garden, room A/B) with independent capacity and optional bookable resources.

## VenueBooking

Private rental records linking `bookingId` to the Booking Engine. Optional Commerce service offering for the rental product.

## Availability

Conflicts, blackouts, and schedules are enforced by the Booking Engine — not a separate venue calendar.
