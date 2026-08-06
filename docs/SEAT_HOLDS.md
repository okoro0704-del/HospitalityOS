# Seat Holds

Temporary server-authoritative seat holds before ticket confirmation.

## Hold record

`CinemaSeatHold`: showtime, seat, `sessionKey`, optional customer, `expiresAt`, status (`active` | `converted` | `expired` | `released`)

## Behaviour

1. `holdSeat` atomically sets seat `status='held'` only if currently `available`
2. Default TTL: 10 minutes (configurable via `holdMinutes`)
3. `releaseExpiredHolds` restores seats and marks holds `expired` (called before hold/book operations)
4. Booking with matching `sessionKey` converts the hold to `booked` / `converted`

No payment is required to hold in Sprint 9.
