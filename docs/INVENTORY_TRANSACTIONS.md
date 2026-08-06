# Inventory Transactions

Every stock mutation creates an `InventoryTransaction`.

## Types

`purchase`, `receipt`, `consumption`, `adjustment`, `transfer`, `damage`, `waste`, `return`, `stock_count`

## Direction

- `in` — increases on-hand / available
- `out` — decreases (blocked when insufficient unless `allowNegative`)

## Concurrency

Balance updates use conditional SQL:

```sql
UPDATE InventoryBalance
SET onHand = onHand + :delta, available = available + :delta
WHERE id = :id AND available + :delta >= 0
```

Losing races receive `insufficient_stock` (409).

## Transfers

`transferStock` posts paired out/in transactions and an `InventoryMovement` row (source, destination, quantity, actor, reason).
