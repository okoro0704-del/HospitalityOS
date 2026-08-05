# Promotions

Promotions and coupons are tenant-scoped and evaluated by the pricing engine.

## Promotion kinds

`percent`, `fixed`, `happy_hour`, `flash`, `bundle`, `auto`

Fields: amount / percent, stackable flag, validity window, channel IDs (JSON, future filtering), status.

## Coupons

- Unique code per tenant (stored uppercase)
- Optional link to a `Promotion`
- Max redemptions + redemption count (increment on future checkout)
- Validity window

## Validation

`POST /commerce/coupons/validate` and `POST /guest/commerce/coupons/validate` check:

- Coupon exists and is active
- Not expired / not before start
- Redemption cap
- Linked promotion active and in window

## Stacking (basic)

- Stackable promotions accumulate discounts.
- Non-stackable coupon can replace prior auto-promo discounts when applied.
- Full stacking matrix is deferred.

## Seed

Demo coupon `SAVE10` (10% off) is seeded per tenant.
