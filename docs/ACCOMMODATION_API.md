# Accommodation API Reference (Sprint 2)

All routes require auth and an enabled `accommodation` module (except where noted). Cross-tenant access returns `404`.

## Staff

| Method | Path | Roles |
|--------|------|-------|
| GET/POST | `/accommodation/properties` | any / admin+manager |
| GET/PATCH | `/accommodation/properties/:id` | any / admin+manager |
| GET/POST | `/accommodation/amenities` | any / admin+manager |
| GET/POST | `/accommodation/room-types` | any / admin+manager |
| GET/PATCH | `/accommodation/room-types/:id` | any / admin+manager |
| GET/POST | `/accommodation/rooms` | any / admin+manager |
| PATCH | `/accommodation/rooms/:id` | ops+ |
| PATCH | `/accommodation/rooms/:id/housekeeping` | ops+ |
| PATCH | `/accommodation/rooms/:id/maintenance` | ops+ |
| GET/POST | `/accommodation/reservations` | any / front_desk+ |
| GET/PATCH | `/accommodation/reservations/:id` | any / front_desk+ |
| POST | `/accommodation/reservations/:id/cancel` | front_desk+ |
| POST | `/accommodation/reservations/:id/check-in` | front_desk+ |
| POST | `/accommodation/reservations/:id/check-out` | front_desk+ |
| GET | `/accommodation/availability` | any staff |
| GET | `/accommodation/calendar` | any staff |
| GET | `/accommodation/guests` | any staff |
| POST | `/accommodation/guests/:id/notes` | front_desk+ |
| PATCH | `/accommodation/guests/:id` | front_desk+ |
| GET | `/accommodation/audit-events` | owner/admin/manager |

## Guest

| Method | Path |
|--------|------|
| GET | `/guest/accommodation/properties` |
| GET | `/guest/accommodation/properties/:id/room-types` |
| GET | `/guest/accommodation/room-types/:id` |
| GET | `/guest/accommodation/availability` |
| POST | `/guest/accommodation/reservations` |
| GET | `/guest/accommodation/reservations` |
| POST | `/guest/accommodation/reservations/:id/cancel` |

## Notifications (internal)

Generated for: reservation confirmed/updated/cancelled, check-in complete, housekeeping assigned, maintenance scheduled.
