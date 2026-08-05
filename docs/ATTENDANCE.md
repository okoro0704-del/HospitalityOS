# Attendance & Check-in

## Attendance

`Attendance` records member presence for:

- Class sessions (`sessionId`)
- Personal training (`trainingId`)
- General gym visits (`kind: gym`)

Statuses: `present` · `late` · `absent` · `cancelled`

Staff POST `/fitness/attendance`. Guests see history on `/guest/fitness/home`.

## Check-ins

`FitnessCheckIn` is a lightweight operational stamp (member, time, facility/area, kind). Used for gym floor entry without requiring a booked session.

- Staff: `POST /fitness/check-ins`
- Guest: `POST /guest/fitness/check-in`

## Access control extension points

`AccessPass` holds `kind`, window (`startsAt`/`expiresAt`), `allowedAreas`, and `offeringId`. Hardware/turnstile/biometric adapters can later:

1. Validate an active membership or pass for a customer.
2. Write a check-in with `source` metadata.
3. Deny entry without inventing a parallel membership store.

No hardware integrations ship in Sprint 6.
