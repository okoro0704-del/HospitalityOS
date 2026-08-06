# Treatment Catalog

Treatments are Commerce **services** (`moduleId: spa_services`).

## Fields

Name, code, description, duration, price, category, image URLs, required room types, required specialties, variants, status.

## Variants

`TreatmentVariant` rows (30/60/90, couples, premium, express) each create their own Commerce offering so promotions and packages can target them.

## Add-ons & packages

Add-ons use Commerce add-ons / offerings. Spa packages wrap Commerce `package` offerings via `SpaPackage.offeringId`.

## Pricing

All list prices and promotions live in the Commerce Engine. The spa module does not compute discounts itself.
