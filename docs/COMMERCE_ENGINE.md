# Commerce Engine

The commerce engine is the commercial backbone shared by every HospitalityOS module. It owns catalog offerings, pricing quotes, promotions, media, add-ons, upsells, and sales-channel readiness — **not** payments or inventory execution.

## Boundaries

| In scope (Sprint 4) | Out of scope |
|---------------------|--------------|
| Catalog CRUD | Payments / POS |
| Pricing quotes | Accounting |
| Promotions & coupons (validate) | Inventory management |
| Service → Booking Engine book | Restaurant ordering workflows |
| Guest browse + book services | Gym/spa product workflows |

## Separation from Booking

- **Commerce** answers *what* is sold and *at what price*.
- **Booking** answers *when* and *which resource* is reserved.
- Services may create bookings via `AvailabilityLink` → `bookServiceOffering`.
- Products never require the Booking Engine.
- Packages may mix both; booking only applies to service children / linked resources.

## Key APIs

Staff: `/commerce/*`  
Guest: `/guest/commerce/*`

See also: [CATALOG_ENGINE.md](./CATALOG_ENGINE.md), [PRICING_ENGINE.md](./PRICING_ENGINE.md), [PROMOTIONS.md](./PROMOTIONS.md), [PACKAGE_MODEL.md](./PACKAGE_MODEL.md).

## Audit

Catalog, price, promotion, coupon, media, and visibility actions write to `AuditLog` (`resource` values such as `offering`, `pricing_rule`, `promotion`).
