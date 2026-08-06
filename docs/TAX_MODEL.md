# Tax Model

Extensible `BillingTaxRule`: code, category, jurisdiction, `rateBps`, inclusive/exclusive.

Separate from Commerce's legacy `TaxRule` (percent float). Billing uses basis points and integer money.

Nigeria VAT is seeded as configurable `VAT` (default 750 bps = 7.5%) — not hard-coded in business logic.
