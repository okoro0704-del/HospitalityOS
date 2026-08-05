# Booking Engine API

All routes are tenant-scoped from the auth session. Cross-tenant IDs return `404`.

Base: HospitalityOS API (`http://localhost:8800`).

## Staff — bootstrap & catalog

| Method | Path | Notes |
|--------|------|-------|
| POST | `/booking/bootstrap` | Ensure default categories + policies |
| GET/POST | `/booking/categories` | List / create categories |
| GET/POST | `/booking/resources` | List / create resources |
| PATCH | `/booking/resources/:id` | Update resource |

## Staff — bookings

| Method | Path | Notes |
|--------|------|-------|
| GET | `/booking/bookings` | Filter `moduleId`, `status` |
| GET | `/booking/bookings/:id` | Detail + items + timeline |
| POST | `/booking/bookings` | Create (`items[]`, times, optional status) |
| PATCH | `/booking/bookings/:id` | Reschedule / notes |
| POST | `/booking/bookings/:id/cancel` | Cancel + waitlist promote |
| POST | `/booking/bookings/:id/transition` | Lifecycle status change |

## Staff — availability & calendar

| Method | Path | Notes |
|--------|------|-------|
| GET | `/booking/availability` | `resourceId`, `startsAt`, `endsAt` |
| POST | `/booking/validate-conflict` | Same checks, body payload |
| GET | `/booking/calendar` | `view`, `date`, optional filters |

## Staff — schedules & closures

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/booking/schedules` | List / create schedules |
| GET/POST | `/booking/blackouts` | Blackout periods |
| GET/POST | `/booking/holidays` | Holidays |

## Staff — policies & waitlist

| Method | Path | Notes |
|--------|------|-------|
| GET | `/booking/policies` | Tenant (+ module) policies |
| PATCH | `/booking/policies/:id` | Update policy knobs |
| GET/POST | `/booking/waitlist` | List / enqueue |
| GET | `/booking/audit-events` | Booking-related audit rows |

## Guest

| Method | Path | Notes |
|--------|------|-------|
| GET | `/guest/booking/resources` | Available resources |
| GET | `/guest/booking/availability` | Availability check |
| POST | `/guest/booking/bookings` | Book (optional waitlist fallback) |
| GET | `/guest/booking/bookings` | Own bookings + timeline |
| PATCH | `/guest/booking/bookings/:id` | Modify |
| POST | `/guest/booking/bookings/:id/cancel` | Cancel |
| POST | `/guest/booking/waitlist` | Join waitlist |

## Error codes (common)

| Code | HTTP | Meaning |
|------|------|---------|
| `validation_error` | 400 | Zod / input |
| `not_found` | 404 | Missing or wrong tenant |
| `capacity_exceeded` | 409 | Overlap / over capacity |
| `blackout_conflict` | 409 | Blackout window |
| `holiday_conflict` | 409 | Holiday closure |
| `resource_unavailable` | 409 | Bad resource status |
| `policy_violation` | 409 | Policy rules |
| `waitlisted` | 409 | No slot; waitlist entry created |
| `invalid_state` | 409 | Illegal lifecycle transition |

## Example — create booking

```http
POST /booking/bookings
Authorization: Bearer <staff-token>
Content-Type: application/json

{
  "moduleId": "events",
  "startsAt": "2031-03-01T10:00:00.000Z",
  "endsAt": "2031-03-01T11:00:00.000Z",
  "items": [{ "resourceId": "…", "quantity": 1 }]
}
```
