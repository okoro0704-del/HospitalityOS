# Cinema Ticketing

Ticket types are Commerce offerings — not a separate pricing engine.

## Ticket types

Examples: General Admission, Premium, VIP, Student, Child, Senior, Member

Each `CinemaTicketType` stores:

- Commerce `offeringId`
- Price, capacity, `soldCount`
- Sales window, access rules, status

## Booking protection

1. Claim ticket-type capacity (`soldCount < capacity`)
2. Claim showtime capacity
3. Claim seat (if assigned)
4. Create ticket + attendee
5. Mark showtime `sold_out` when full

Failures release prior claims. Optional waitlist when sold out.

## Guest APIs

`POST /guest/cinema/tickets`, `GET /guest/cinema/tickets`, cancel endpoint.
