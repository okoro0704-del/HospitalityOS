# Multi-Tenant Strategy

## Model

One HospitalityOS deployment serves many businesses:

```text
HospitalityOS
├── Sunrise Hotel
├── Bella Restaurant
├── Peak Fitness Gym
├── Serenity Spa
├── Ocean View Resort
├── Royal Event Centre
└── City Cinema
```

## Isolation strategy (Sprint 1)

**Shared database, shared schema, mandatory `tenantId`.**

| Layer | Mechanism |
|-------|-----------|
| Schema | Nearly all business tables include `tenantId` |
| Auth | Session binds actor → single `tenantId` |
| Queries | Always filter by `req.tenantId` from session |
| Cross-tenant reads | Return `404 not_found` (no existence leak) |
| Unique keys | Composite where needed (`tenantId + email`, etc.) |

## Tenant resources

- Branding (logo, colours, theme, font)
- Contact details & operating hours
- Branches
- Enabled modules + per-module config JSON
- Customers, staff, sessions
- Notifications, audit logs

## Mapping to LifeOS

Each tenant may store:

- `experienceId` — LifeOS experience audience (e.g. `exp_sunrise_hotel`)
- `lifeosBusinessId` — business registry id

Guest handoff JWTs are accepted only when audience/experience maps to the tenant.

## Future hardening

- Row-level security in Postgres
- Per-tenant encryption keys
- Optional dedicated DB per enterprise tenant
- Region pinning
