# Folder Structure

```text
HospitalityOS/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Multi-tenant data model
│   │   │   └── seed.ts            # Demo tenants & modules
│   │   ├── src/
│   │   │   ├── index.ts           # Fastify bootstrap
│   │   │   ├── config.ts
│   │   │   ├── db.ts
│   │   │   ├── routes.ts          # HTTP surface
│   │   │   ├── lib/               # auth, crypto, lifeos, mappers
│   │   │   └── services/          # guest-auth, staff-auth, modules
│   │   └── test/                  # Sprint 1 automated tests
│   ├── guest-pwa/
│   │   └── src/
│   │       ├── pages/             # Home, Explore, Bookings, Profile, Auth
│   │       ├── components/        # Shell, RequireGuest
│   │       └── lib/session.ts     # Local guest session + exchange client
│   └── staff-web/
│       └── src/
│           ├── pages/             # Dashboard, Modules, CRM shells, Settings
│           ├── components/        # StaffShell, RequireStaff
│           └── lib/api.ts
├── packages/
│   └── shared/
│       └── src/index.ts           # MODULE_CATALOG + public types
├── docs/
├── package.json                   # npm workspaces root
├── .env.example
└── README.md
```

## Adding a new module (framework only)

1. Add the id to `MODULE_IDS` / `MODULE_CATALOG` in `packages/shared`.
2. Seed or enable it for tenants via `TenantModule`.
3. Later sprints: add domain tables + routes under the same tenant isolation rules.
