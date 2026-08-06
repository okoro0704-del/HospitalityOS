# Event Check-in

## Flow

Staff `POST /check-in` with `ticketId`:

1. Validates ticket not cancelled
2. Sets attendee `checkInStatus` to `checked_in`
3. Writes `EventCheckIn` with timestamp + staff id
4. Marks ticket `used`
5. Audits + optional guest notification

## Statuses

`not_checked_in` · `checked_in` · `cancelled` · `no_show`

## Extension points

`EventCheckIn.source` and `metadata` are ready for future QR/barcode scanners. No hardware integrations in Sprint 8.

## Roles

`checkin_staff`, `event_staff`, `event_manager`, admin/reception roles may check in. Guests cannot access staff check-in APIs.
