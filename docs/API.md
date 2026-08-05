# HospitalityOS API (Sprint 1)

Base URL (dev): `http://localhost:8800`

## Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | public |

## Modules

| Method | Path | Auth |
|--------|------|------|
| GET | `/modules/catalog` | public |
| GET | `/tenant/modules` | staff |
| PUT | `/tenant/modules/:moduleId` | staff `owner`/`admin` |
| GET | `/guest/modules` | guest |

## Tenants / branding

| Method | Path | Auth |
|--------|------|------|
| GET | `/tenants/:slug/public` | public |
| GET | `/tenant` | staff |
| PATCH | `/tenant/branding` | staff `owner`/`admin` |
| GET | `/platform/tenants` | public (dev/platform list) |

## Auth

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/guest/exchange` | public (LifeOS handoff) |
| GET | `/auth/guest/me` | guest |
| POST | `/auth/guest/logout` | guest |
| POST | `/auth/staff/login` | public |
| GET | `/auth/staff/me` | staff |
| POST | `/auth/staff/logout` | staff |

### Guest exchange body

```json
{ "handoff": "hof_…", "experienceId": "exp_sunrise_hotel" }
```

## Branches / CRM shells

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/branches` | staff |
| GET/POST | `/customers` | staff |
| GET | `/customers/:id` | staff (tenant-scoped) |
| GET | `/staff` | staff `owner`/`admin`/`manager` |
| GET | `/notifications` | staff |
| GET | `/guest/notifications` | guest |
| GET | `/audit-logs` | staff `owner`/`admin` |

## Errors

```json
{ "error": "not_found", "message": "Resource not found" }
```

Validation failures return `400` with `error: "validation_error"`.

## Related APIs

- Accommodation (Sprint 2): [ACCOMMODATION_API.md](./ACCOMMODATION_API.md)
- Universal Booking Engine (Sprint 3): [API_BOOKING.md](./API_BOOKING.md)
