# Cinema Seating Model

Optional assigned seating for screens.

## Hierarchy

`CinemaSeatMap` (per screen) → `CinemaSeatSection` → `CinemaSeat`

## Seat fields

- Label, row, seat type
- `accessible`, `premium`, `vip` flags
- Status: `available` | `held` | `booked` | `blocked` | `unavailable`
- `holdSessionId` while held

## Modes

- **General admission** — no seat required at booking
- **Assigned** — `seatId` required; atomic `UPDATE … WHERE status='available'` (or held by session) prevents double booking
