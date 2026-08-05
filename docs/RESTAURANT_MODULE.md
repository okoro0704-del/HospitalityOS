# Restaurant & Dining Module

Sprint 5 adds a full **Restaurant & Dining** module that consumes the Booking Engine (tables/reservations) and Commerce Engine (menu items) — it does not invent parallel systems.

## Scope

Supports restaurants, cafés, lounges, bars, food courts, hotel dining, rooftops, beach clubs, plus room-service / delivery foundations (order types only — no logistics).

## Architecture

```text
DiningArea → DiningTable ──sync──► BookableResource (Booking Engine)
                 │
                 └── DiningReservation.bookingId → Booking

DiningMenu → MenuSection → MenuItem.offeringId → Offering (Commerce)
                 │
DiningOrder → KitchenTicket (stations)
```

| Concern | Engine |
|---------|--------|
| Table inventory & time slots | Booking Engine |
| Menu item catalog/pricing | Commerce Engine |
| Orders / kitchen / shifts | Restaurant module |

## Staff surfaces

`/dining` — dashboard, tables, reservations, menus, orders, kitchen, shifts

## Guest surfaces

`/dining` — menus, featured offers, reserve / waitlist, reservation history

## Module gate

Routes require `restaurant` enabled (`requireRestaurantModule` → 404 `module_disabled`).

## Out of scope

Payments, POS hardware, inventory deduction, accounting, token payments, Business Portal.
