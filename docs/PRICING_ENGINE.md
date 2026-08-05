# Pricing Engine

Centralized price calculation for all offerings.

## Inputs

- Offering `basePrice` (or package `bundlePrice`)
- Active `PricingRule` rows (priority ascending)
- Offering-level `Discount` rows
- Automatic promotions (`auto`, `flash`, `happy_hour`, `bundle`)
- Optional coupon code
- Tax rule (non-inclusive percent)

## Rule kinds

`fixed`, `hourly`, `daily`, `weekly`, `monthly`, `seasonal`, `weekend`, `peak`, `off_peak`, `member`, `corporate` (placeholder), `custom`

Rules may constrain `startsAt` / `endsAt` and `daysOfWeek`.

## Quote shape

```ts
{
  offeringId, basePrice, unitPrice, quantity,
  subtotal, discountAmount, taxAmount, total,
  currencyCode, appliedRules, appliedPromotions, couponCode?
}
```

## API

- `POST /commerce/pricing/quote`
- `POST /guest/commerce/pricing/quote`
- `GET/POST /commerce/pricing-rules`

## Notes

- Multi-currency: `Currency` model + `currencyCode` on offerings; conversion not implemented yet.
- Corporate / member pricing hooks exist; member flag is passed into `calculatePrice`.
- No payment capture in this sprint — quotes are informational / booking-adjacent only.
