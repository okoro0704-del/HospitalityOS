# Menu Engine (Dining)

Dining menus are a thin operational layer over the **Commerce Catalog**.

## Model

- `DiningMenu` — named menu (seasonal/featured flags, optional dining area)
- `MenuSection` — categories within a menu
- `MenuItem` — line item with `offeringId` pointing at a Commerce `Offering`

When staff create a menu item via `POST /dining/sections/:id/items`, the service:

1. Creates a Commerce product (default) or service offering (`asProduct: false`)
2. Stores the dining `MenuItem` linked to that offering
3. Audits `menu_item.created`

## Guest browse

`GET /guest/dining/menus` returns active menus/sections/available items.

`GET /guest/dining/offers` returns featured menu items.

## Variants & modifiers

Commerce variants/modifiers/option groups remain available on the linked offering for future menu UX. Dining `MenuItem.metadata` can store dining-specific hints (allergens, spice).
