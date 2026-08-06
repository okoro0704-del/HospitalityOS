# Ticketing

## Ticket types

`EventTicketType` maps to a Commerce **product** (`moduleId: ticketing`) with price, capacity, sales window, and access rules JSON.

## Inventory

- `soldCount` / `capacity` on ticket type **and** event
- Remaining = capacity − soldCount
- Status may move to `sold_out` when event capacity is reached

## Booking flow

`bookEventTicket` → atomic capacity claim → create `EventTicket` + `EventAttendee` → notify + audit.

## Concurrency

SQLite-safe atomic updates:

```sql
UPDATE EventTicketType SET soldCount = soldCount + 1
WHERE id = ? AND soldCount < capacity
```

Only one concurrent request wins the last ticket. Failures join waitlist when requested.

## Cancellation

Releases capacity, frees seats, may promote the oldest waitlist entry and reopen a sold-out event.
