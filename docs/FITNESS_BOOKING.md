# Fitness Booking Integration

## Classes

1. Staff defines a `FitnessClass` (capacity, duration, membership eligibility).
2. `createClassSession` creates a Booking Engine `BookableResource` with `sourceType: class_session` and category `fitness`.
3. Guests/staff book via `bookClassSession` → `createBooking` on that resource.
4. Capacity, conflicts, and waitlists are owned by the Booking Engine (`allowWaitlistFallback`).

## Personal training

1. Trainer gets (or creates) a bookable resource (`sourceType: trainer`, capacity 1).
2. PT booking creates a Commerce service offering (when possible) and a Booking Engine booking.
3. `TrainingSession` stores `bookingId` + optional `offeringId`.

## Facility reservations

Limited-capacity areas can be scheduled later through the same Booking Engine patterns; Sprint 6 focuses on class sessions and trainers.

## Do not

- Duplicate schedules, calendars, or conflict detection inside the fitness module.
- Bypass Booking policies (advance window, waitlist, cancellation).
