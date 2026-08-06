# Cinema Concessions

Concessions use the Commerce Engine as product offerings.

## Items

`CinemaConcession` — popcorn, drinks, snacks, combos, merchandise — linked to optional venue and `offeringId`.

Variants/modifiers stored as JSON placeholders (no inventory deduction in Sprint 9).

## Orders

Lightweight workflow on `CinemaConcessionOrder`:

`draft` → `submitted` → `preparing` → `ready` → `collected` (or `cancelled`)

Not a restaurant kitchen engine; line items reference concessions only. Status `ready` notifies the guest when a customer is attached.
