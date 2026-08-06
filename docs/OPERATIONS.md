# Operations & Inventory Foundation

Sprint 10 adds a **shared Operations & Inventory** layer reusable across every HospitalityOS vertical.

## Module

- Catalog id: `inventory` (name: Operations & Inventory)
- Gate: `requireInventoryModule`
- Staff navigation: `/operations/*`
- Guests: no inventory management UI

## Capabilities

| Area | Purpose |
|------|---------|
| Locations / areas | Nested store hierarchy |
| Items / categories / units | Shared catalog of stocked goods |
| Balances | onHand, reserved, available, damaged, expired |
| Transactions | Auditable stock mutations |
| Movements | Location-to-location transfers |
| Stock counts | Physical count → adjustment txs |
| Reorder rules / alerts | Operational alerts only (no auto-purchase) |
| Suppliers / purchase requests | Lightweight internal procurement |
| Assets / maintenance | Equipment register + tickets |
| Operational tasks | Cross-vertical work queue |

## Principles

- One inventory foundation — not per vertical
- Never silently change balances without a transaction
- Atomic SQL updates prevent negative available stock (unless `allowNegative`)
- Commerce products may optionally link via `ProductDetail.inventoryItemId`
- `consumeInventory()` is the extension point for future order deduction

## Related docs

- [INVENTORY.md](./INVENTORY.md)
- [INVENTORY_TRANSACTIONS.md](./INVENTORY_TRANSACTIONS.md)
- [STOCK_COUNTS.md](./STOCK_COUNTS.md)
- [ASSET_MANAGEMENT.md](./ASSET_MANAGEMENT.md)
- [MAINTENANCE.md](./MAINTENANCE.md)
- [OPERATIONAL_TASKS.md](./OPERATIONAL_TASKS.md)
