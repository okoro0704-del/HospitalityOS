# Catalog Engine

HospitalityOS uses one **Catalog** per tenant as the commercial inventory of everything a business sells or offers.

## Architecture

```text
Catalog
  ├── CatalogCategory (nested)
  └── Offering (kind: service | product | package)
        ├── ServiceDetail + AvailabilityLink → Booking Engine
        ├── ProductDetail (SKU, stock placeholder)
        ├── PackageDetail + PackageItem
        ├── Variants / Options / Modifiers
        ├── MediaAsset
        ├── PricingRule
        ├── Addon
        └── OfferingRelation (upsell / cross-sell)
```

Implementation:

| Layer | Path |
|-------|------|
| Models | `apps/api/prisma/schema.prisma` |
| Services | `apps/api/src/services/commerce-engine.ts` |
| REST | `apps/api/src/routes-commerce.ts` |
| Shared types | `packages/shared` (`OFFERING_KINDS`, …) |
| Staff UI | `/commerce/*` |
| Guest UI | `/catalog`, `/catalog/:id` |

## Offering kinds

| Kind | Role |
|------|------|
| **Service** | Experiences; may link to bookable resources |
| **Product** | Goods; independent of booking |
| **Package** | Bundle of services and/or products |

## Catalog features

- Nested categories (`parentId`)
- Search / filter by kind, category, featured
- Status: `draft`, `active`, `archived`, `featured`
- Visibility: `public`, `staff`, `hidden`
- Tags, custom attributes, media, SEO slug field (reserved)

## Bootstrap

`POST /commerce/bootstrap` ensures:

- Default catalog (`code: default`)
- USD currency
- Default sales channels
- Zero-rate tax rule placeholder

## Extension

Future modules (Restaurant, Spa, Gym, …) publish offerings into the same catalog with their `moduleId` — no per-vertical catalog forks.
