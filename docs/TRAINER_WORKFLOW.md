# Trainer Workflow

## Profile

`Trainer` — display name, email, specializations, bio, optional `staffId` link to HospitalityOS staff, optional bookable resource.

## Class assignment

`TrainerAssignment` links trainers to `FitnessClass` as instructor (or similar role). Class sessions may set `trainerId`.

## Availability

Trainer time is booked through the Booking Engine resource on the trainer. Overlapping PT bookings conflict at engine level (capacity 1).

## Personal training flow

1. Select trainer
2. Choose start/end (duration)
3. Book → Commerce service + Booking + `TrainingSession`
4. Cancel via Booking Engine cancellation (class cancel helper mirrors this for classes)
5. History via `/fitness/training-sessions` (staff) and guest fitness home

## Staff roles

`trainer` and `instructor` roles can manage operational fitness actions (sessions, attendance, check-ins) under existing staff authorization — not a separate identity system.
