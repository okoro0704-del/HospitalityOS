# Seating

## Modes

- `general_admission` — no seats
- `assigned` — requires `seatId` on ticket purchase

## Models

`SeatingPlan` → `SeatSection` → `Seat` (status: available | sold)

## Concurrency

Seat claim:

```sql
UPDATE Seat SET status = 'sold' WHERE id = ? AND status = 'available'
```

Prevents two guests from taking the same last seat.

## Guest UX

`/guest/events/:id/seating` lists availability; booking passes `seatId` to `/guest/tickets`.
