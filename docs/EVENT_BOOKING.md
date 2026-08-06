# Event Booking Integration

## Booking Engine

| Domain | Integration |
|--------|-------------|
| Venue rental | `createBooking` on venue/area resources |
| Event sessions | Bookable resources for capacity-controlled sessions |
| Waitlists (venue) | Engine waitlist when used for resources |

## Commerce Engine

| Domain | Integration |
|--------|-------------|
| Ticket types | Product offerings |
| Packages / add-ons | Package & product offerings |
| Venue rental product | Service offering (optional) |

## Ticketing capacity

Handled in the Events module with atomic sold-count updates (not a second booking engine). Venue time conflicts remain in Booking Engine.

## Do not

Duplicate calendars, pricing, or reservation systems inside Events.
