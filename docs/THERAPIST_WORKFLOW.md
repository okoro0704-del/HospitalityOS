# Therapist Workflow

## Profile

`SpaTherapist` — display name, email, bio, working hours JSON, status, optional staff link, specialties, treatment assignments.

## Booking resource

On create (or first booking), a bookable resource is ensured (`sourceType: spa_therapist`, capacity 1). Availability and conflicts are Booking Engine concerns.

## Assignments

`TherapistTreatmentLink` limits which treatments a therapist may perform when links exist. Empty assignment list allows any treatment (specialty rules still apply).

## Shifts

`SpaShift` records scheduled work windows for ops visibility. Hard availability enforcement remains on the bookable resource via Booking Engine schedules/blackouts when configured.
