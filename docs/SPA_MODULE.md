# Spa & Wellness Module

Sprint 7 adds a flexible **Spa & Wellness** module for spas, hotel spas, beauty studios, massage centres, sauna/thermal facilities, and wellness retreats.

It consumes the **Booking Engine** and **Commerce Engine**. It does not invent parallel pricing, scheduling, or authentication systems.

## Architecture

```text
Treatment.offeringId / TreatmentVariant.offeringId ──► Offering (Commerce)
SpaPackage.offeringId / SpaMembershipPlan.offeringId ──► Offering (Commerce)

SpaTherapist.bookableResourceId ──► BookableResource (Booking)
TreatmentRoom.bookableResourceId ──► BookableResource (Booking)
WellnessArea.bookableResourceId ──► BookableResource (Booking)
SpaAppointment.bookingId / WellnessFacilitySession.bookingId ──► Booking
```

| Concern | Engine / module |
|---------|-----------------|
| Treatment catalog & price | Commerce Engine |
| Therapist / room / facility slots | Booking Engine |
| Appointments, notes, clients | Spa module |
| Waitlists | Booking Engine (`moduleId: spa_services`) |

## Module gate

Routes require `spa_services` **or** `beauty_appointments` **or** `wellness_packages` (`requireSpaModule` → 404 `module_disabled`).

## Staff surfaces

`/spa` — dashboard, appointments, calendar, treatments, therapists, rooms, facilities, clients, consultations, notes, wellness, packages, memberships, waitlist

## Guest surfaces

`/spa`, `/spa/treatments`, `/spa/therapists`, `/spa/calendar`, `/spa/book`, `/spa/my-appointments`, `/spa/packages`, `/spa/memberships`

## Roles

`spa_manager`, `reception`, `spa_therapist`, `wellness_instructor` (plus owner/admin/manager/front_desk/operations). Sensitive consultation and treatment notes: `owner`, `admin`, `spa_manager`, `spa_therapist` only.

## Out of scope

Payments, medical diagnosis/records, insurance, payroll, accounting, inventory, biometric access, token payments, Business Portal.
