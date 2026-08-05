# Scheduling Engine

The scheduling engine sits beside bookings and describes **when** resources can be offered. It is module-agnostic.

## Concepts

| Concept | Purpose |
|---------|---------|
| `ResourceSchedule` | Named schedule (one-time, daily, weekly, monthly, seasonal, recurring) |
| `TimeSlot` | Concrete open window with capacity counters |
| `AvailabilityRule` | Extra rule config attached to a resource or module |
| `BlackoutPeriod` | Maintenance / closed windows (resource or tenant-wide) |
| `Holiday` | Closed calendar days |
| Tenant `operatingHours` | Business-level open/closed days (Sprint 1) |

Schedule kinds (`SCHEDULE_KINDS`): `one_time`, `daily`, `weekly`, `monthly`, `seasonal`, `recurring`.

## How availability uses schedules

Central availability (`checkAvailability` / `findResourceConflicts`) currently enforces:

1. Resource status (`available` vs maintenance/blocked/retired/unavailable)
2. Overlapping blackouts
3. Holidays overlapping the requested interval
4. Capacity vs active booking items in blocking statuses

Schedules and time slots are stored and exposed for calendar/ops UIs; future modules can tighten availability further using schedule windows without replacing the engine.

## Recurring schedules

Staff create schedules via `POST /booking/schedules` with:

- `kind` (e.g. `weekly`)
- `daysOfWeek` (0–6)
- `startTime` / `endTime`
- optional `startsOn` / `endsOn` season bounds
- optional `resourceId` / `moduleId` / `capacity`

Audit + staff notification fire on create.

## Calendar engine

`buildBookingCalendar` returns a generic projection:

- Views: `day`, `week`, `month`, `timeline`, `agenda`, `resource`, `branch`
- Filterable by `moduleId`, `branchId`, `resourceId`
- Includes resources + bookings in range (not accommodation-specific)

Staff Web: **Engine Calendar**. Accommodation keeps its stay calendar for room-night ops.

## Exceptions

- Blackouts override open schedules for conflict detection.
- Holidays close the day for any overlapping request.
- Resource `maintenance` / `blocked` statuses reject bookings immediately.
