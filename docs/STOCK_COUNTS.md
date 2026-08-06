# Stock Counts

1. `startStockCount` snapshots expected quantities from balances
2. Staff record `actualQty` per item
3. `submitStockCount` posts `stock_count` transactions for each variance (never silent overwrite)
4. Matching `InventoryAdjustment` rows are created for audit

Statuses: `draft` → `in_progress` → `submitted` (or `cancelled`)
