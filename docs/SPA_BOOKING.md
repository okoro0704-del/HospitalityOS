# Spa Booking Integration

## Appointments

1. Staff/guest selects treatment (optional variant, therapist, room).
2. `bookSpaAppointment` validates specialty and room-type compatibility.
3. Therapist and room map to Booking Engine resources (capacity 1 for therapists).
4. `createBooking` owns conflicts, capacity, policies, and waitlist fallback.
5. `SpaAppointment` stores the domain row with `bookingId`.

## Wellness facilities

Sauna / steam / pool areas become bookable resources (`sourceType: wellness_area`). Reservations create `WellnessFacilitySession` + Booking.

## Conflicts prevented via Booking Engine

- Therapist double booking
- Room double booking
- Capacity overflows
- Closed-hours / policy violations (engine policies)

Spa-layer checks add:

- Required specialty vs therapist specialties
- Required room type vs room type
- Maintenance / out-of-service rooms

## Do not

Create a separate spa reservation calendar or conflict engine.
