# Showtime Model

A showtime binds **content** to a **screen** for a time window.

## Fields

- `contentId`, `screenId`, `startsAt`, `endsAt`
- `capacity`, `soldCount`
- `seatingMode`, `status`
- `bookableResourceId` (showtime metadata resource)
- `bookingId` (Booking Engine booking that reserves the screen)

## Lifecycle

Statuses: `draft`, `scheduled`, `on_sale`, `sold_out`, `in_progress`, `completed`, `cancelled`

`openShowtimeForSale` moves a showtime to `on_sale` and records `publishedAt`.

## Capacity

Atomic SQL updates increment `soldCount` only while `soldCount < capacity`. Concurrent last-ticket races lose safely.
