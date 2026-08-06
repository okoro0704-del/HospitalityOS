# Customer Loyalty Foundation

## Scope

Business-level loyalty placeholder only:

- Status (`none`, `enrolled`, `active`, `paused`, `closed`)
- Points balance (integer placeholder)
- Tier (string)
- Enrollment date

## Explicitly out of scope

- Cryptocurrency / ecosystem tokens
- LifeOS wallet integration
- Earn/burn engines, campaigns, or payment settlement

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/customers/:id/loyalty` | Ensures profile exists |
| PATCH | `/customers/:id/loyalty` | Enroll, tier, points |

Guests may see loyalty status on `/guest/customer` when a profile exists.

Future loyalty products should extend `CustomerLoyaltyProfile` rather than inventing parallel customer stores.
