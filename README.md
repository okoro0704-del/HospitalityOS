# HospitalityOS

The operating system for hospitality, leisure, tourism, and the experience economy.

One modular codebase powers hotels, restaurants, gyms, spas, event centres, cinemas, resorts, and any future venue type. Businesses activate the modules they need — there is no HotelOS, GymOS, or SpaOS.

## Sprint 1 — Core Platform Foundation

This sprint establishes the independent platform:

- Multi-tenant backend API with data isolation
- Module registry (enable/disable per tenant)
- Business branding & configuration data model
- Guest PWA shell + LifeOS experience-session handoff
- Staff Web shell + role-aware navigation
- Automated tests and architecture documentation

Sprint 1–5 established platform, accommodation, booking, commerce, and dining. Sprint 6 adds the **Gym, Fitness & Membership Module** on those engines.

## Monorepo layout

```text
HospitalityOS/
├── apps/
│   ├── api/          # Fastify + Prisma API
│   ├── guest-pwa/    # Guest progressive web app
│   └── staff-web/    # Staff operations console
├── packages/
│   └── shared/       # Module catalog + shared types
├── docs/             # Architecture & integration docs
├── package.json
└── .env.example
```

## Quick start

```bash
# From HospitalityOS root
npm run setup
npm run dev
```

| App | URL |
|-----|-----|
| API | http://localhost:8800 |
| Guest PWA | http://localhost:5180 |
| Staff Web | http://localhost:5181 |

### Demo staff login

| Venue | Email | Password |
|-------|-------|----------|
| Sunrise Hotel | front@sunrise.hotel | password123 |
| Peak Fitness | ops@peak.fitness | password123 |
| Serenity Spa | care@serenity.spa | password123 |

### Guest auth

Guests authenticate via LifeOS:

```text
TrustID → LifeOS → Experience Session handoff
       → HospitalityOS /auth/lifeos?handoff=…&experience_id=…
       → POST /auth/guest/exchange → local HospitalityOS session
```

HospitalityOS never receives TrustID credentials.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run setup` | Install, generate Prisma, push schema, seed |
| `npm run dev` | API + Guest PWA + Staff Web |
| `npm test` | API tests (Sprints 1–3, concurrency 1) |
| `npm run build` | Build all packages/apps |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Multi-tenant strategy](docs/MULTI_TENANT.md)
- [Module architecture](docs/MODULES.md)
- [Authentication](docs/AUTHENTICATION.md)
- [TrustID & LifeOS integration](docs/INTEGRATIONS.md)
- [White-label strategy](docs/WHITE_LABEL.md)
- [Folder structure](docs/FOLDER_STRUCTURE.md)
- [API overview](docs/API.md)
- [Accommodation module](docs/ACCOMMODATION.md)
- [Accommodation API](docs/ACCOMMODATION_API.md)
- [Booking engine](docs/BOOKING_ENGINE.md)
- [Scheduling engine](docs/SCHEDULING_ENGINE.md)
- [Resource model](docs/RESOURCE_MODEL.md)
- [Booking API](docs/API_BOOKING.md)
- [Catalog engine](docs/CATALOG_ENGINE.md)
- [Commerce engine](docs/COMMERCE_ENGINE.md)
- [Pricing engine](docs/PRICING_ENGINE.md)
- [Promotions](docs/PROMOTIONS.md)
- [Package model](docs/PACKAGE_MODEL.md)
- [Restaurant module](docs/RESTAURANT_MODULE.md)
- [Gym & fitness module](docs/GYM_MODULE.md)
- [Membership model](docs/MEMBERSHIP_MODEL.md)
- [Fitness booking](docs/FITNESS_BOOKING.md)
- [Attendance](docs/ATTENDANCE.md)
- [Trainer workflow](docs/TRAINER_WORKFLOW.md)
- [Menu engine](docs/MENU_ENGINE.md)
- [Order workflow](docs/ORDER_WORKFLOW.md)
- [Kitchen display](docs/KITCHEN_DISPLAY.md)
- [Definition of done](docs/DEFINITION_OF_DONE.md)

## Independence

HospitalityOS is a **separate product** from TrustID and LifeOS. It has its own frontend(s), backend, database, APIs, sessions, and deployment pipeline. Integration is protocol-based only.
