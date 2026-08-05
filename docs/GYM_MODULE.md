# Gym, Fitness & Membership Module

Sprint 6 adds a flexible **Gym / Fitness / Membership** module for gyms, studios, hotel fitness centres, CrossFit boxes, martial arts schools, and similar businesses.

It consumes the existing **Booking Engine** and **Commerce Engine**. It does not invent parallel pricing or scheduling systems.

## Scope

Membership-based and appointment/class-based operations:

- Facilities & areas (gym floor, studio, pool, sauna, …)
- Membership plans & member lifecycle
- Fitness classes & class sessions
- Trainers & personal training
- Attendance & check-ins
- Day / guest / trial access passes

## Architecture

```text
MembershipPlan.offeringId ──► Offering (Commerce)
AccessPass.offeringId     ──► Offering (Commerce)
TrainingSession.offeringId──► Offering (Commerce, service)

ClassSession.bookableResourceId ──► BookableResource (Booking)
Trainer.bookableResourceId      ──► BookableResource (Booking)
ClassBooking.bookingId / TrainingSession.bookingId ──► Booking
```

| Concern | Engine / module |
|---------|-----------------|
| Plan / pass / PT catalog & price | Commerce Engine |
| Class capacity & PT time slots | Booking Engine |
| Membership state machine | Fitness module |
| Attendance / check-in / passes | Fitness module |

## Module gate

Staff and guest fitness routes require `gym_membership` **or** `fitness_classes` (`requireGymModule` → 404 `module_disabled`).

## Staff surfaces

`/fitness` — dashboard, facilities, members, plans, memberships, classes, calendar, trainers, PT, attendance, check-ins, access passes

## Guest surfaces

`/fitness` — home, membership, classes, trainers, passes, check-in

## Staff roles

Uses HospitalityOS staff auth. Fitness-aware roles include `manager`, `front_desk`, `trainer`, `instructor` (plus owner/admin/operations).

## Notifications & audit

Membership activate/freeze/cancel, class booked, PT booked, attendance confirmation. Membership, class, booking, trainer, attendance, check-in, and pass events are audited.

## Out of scope

Payment processing, biometric/turnstile hardware, accounting, payroll, inventory, token payments, Business Portal.
