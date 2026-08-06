# Cinema & Entertainment Module

Sprint 9 adds **Cinema & Entertainment** for multi-screen cinemas, movie theatres, private screening rooms, and hotel cinema experiences.

## Architecture

- Module id: `cinema` (gated via `requireCinemaModule`)
- Screens integrate with the **Booking Engine** as bookable resources (`sourceType: cinema_screen`)
- Showtimes schedule screen availability through Booking Engine bookings
- Ticket types and concessions are **Commerce Engine** offerings (`moduleId: cinema`)
- No duplicate ticketing, pricing, or scheduling engines

## Domain

| Concept | Model |
|---------|--------|
| Venue | `CinemaVenue` |
| Screen | `CinemaScreen` |
| Content | `CinemaContent` |
| Showtime | `CinemaShowtime` |
| Ticket type / ticket | `CinemaTicketType` / `CinemaTicket` |
| Seating | `CinemaSeatMap` → `CinemaSeatSection` → `CinemaSeat` |
| Holds | `CinemaSeatHold` |
| Concessions | `CinemaConcession` + orders |
| Check-in | `CinemaCheckIn` / `CinemaAttendee` |

## Showtime lifecycle

`draft` → `scheduled` → `on_sale` → `sold_out` | `in_progress` → `completed`  
Also: `cancelled`

## Staff / Guest

- Staff Web: `/cinema/*` (dashboard, venues, screens, seats, content, showtimes, tickets, attendees, check-in, concessions, orders, shifts)
- Guest PWA: `/cinema`, `/cinema/:id`, showtimes, seats, `/cinema/my-tickets`

## Demo tenant

City Cinema — `box@city.cinema` / `password123` (modules: `cinema`, `ticketing`, …)

## Related docs

- [SCREEN_MODEL.md](./SCREEN_MODEL.md)
- [SHOWTIME_MODEL.md](./SHOWTIME_MODEL.md)
- [SEATING_MODEL.md](./SEATING_MODEL.md)
- [SEAT_HOLDS.md](./SEAT_HOLDS.md)
- [CINEMA_TICKETING.md](./CINEMA_TICKETING.md)
- [CONCESSIONS.md](./CONCESSIONS.md)
