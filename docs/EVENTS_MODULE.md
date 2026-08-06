# Events & Venues Module

Sprint 8 adds **Events & Venues** for event centres, conferences, weddings, concerts, exhibitions, and private venue rentals.

Supports **venue rental** and **ticketed/public events**. Consumes Booking + Commerce — no parallel scheduling or pricing engines.

## Architecture

```text
EventVenue / VenueArea ──bookableResourceId──► BookableResource (Booking)
EventSession ──bookableResourceId──► BookableResource
VenueBooking.bookingId ──► Booking

EventTicketType.offeringId ──► Offering (Commerce / ticketing)
EventPackage / EventAddon.offeringId ──► Offering (Commerce)
```

## Module gate

`events` **or** `ticketing` **or** `venue_booking` (`requireEventsModule`).

## Staff / Guest

Staff `/events/*`, `/venues/*`, `/tickets/*`, `/seating/*`, `/attendees`, `/check-in`, `/waitlist`

Guest `/events`, `/events/:id`, tickets, seating, `/events/my-tickets`, `/events/my-events`

## Roles

`event_manager`, `venue_manager`, `event_staff`, `checkin_staff` (+ existing admin/reception roles)

## Out of scope

Payments, ticket-scanning hardware, biometric access, accounting, payroll, Business Portal.
