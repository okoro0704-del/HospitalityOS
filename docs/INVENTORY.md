# Inventory

## Locations

`InventoryLocation` supports parent/child nesting (e.g. Main Store → Dry Storage). Optional `InventoryArea` rows attach named zones to a location.

## Items

`InventoryItem` fields: name, SKU, category, unit, min/max, reorder point, `allowNegative`, status.

Units: piece, box, pack, kilogram, gram, litre, millilitre, meter.

## Balances

Per `(tenant, item, location)`:

- `onHand`, `reserved`, `available`, `damaged`, `expired`

`available` is maintained transactionally and cannot go negative unless the item allows it.

## Commerce link

Optional: `ProductDetail.inventoryItemId` links a physical commerce product to an inventory item. Services/digital offerings stay unlinked.
