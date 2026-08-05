# Module Architecture

## Principle

There is only **HospitalityOS**. Vertical capabilities are **modules** that tenants enable or disable.

## Registry

The canonical catalog lives in `@hospitalityos/shared` (`MODULE_CATALOG`).

Examples:

| Tenant | Enabled modules |
|--------|-----------------|
| Sunrise Hotel | Accommodation, Restaurant, Events, Reservations, … |
| Peak Fitness | Gym Membership, Fitness Classes, Wellness Packages, … |
| Royal Event Centre | Venue Booking, Ticketing, Events, … |

## Runtime model

```text
MODULE_CATALOG (code)  +  TenantModule (DB rows)
        │                        │
        └──────────┬─────────────┘
                   ▼
         Effective module set per tenant
```

- Adding a module to the catalog does not auto-enable it.
- Enabling writes/updates `TenantModule` and an audit log entry.
- Staff UI reads `/tenant/modules`; guests see enabled modules with `guestNavKey`.

## Categories

`core` · `hospitality` · `dining` · `wellness` · `events` · `operations` · `growth` · `insights`

## Extensibility

To introduce a new business capability later:

1. Register definition in `MODULE_CATALOG`.
2. Ship domain tables/services behind the module id.
3. Gate routes with `assertModuleEnabled(tenantId, moduleId)`.
4. Surface nav entries via `staffNavKey` / `guestNavKey`.

No redesign of the platform kernel is required.
