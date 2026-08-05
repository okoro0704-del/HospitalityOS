# Package Model

Packages bundle services and/or products into a single sellable offering.

## Structure

```text
Offering (kind=package)
  └── PackageDetail
        bundlePrice?
        validityDays?
        inheritAvailability
  └── PackageItem[]
        childOfferingId → Offering (service or product)
        quantity
        required / optional
```

## Pricing

1. If `bundlePrice` is set, it is the package unit price.
2. Else the engine sums `child.basePrice * quantity` (`package_sum` rule label).

## Composition rules

- Mixed contents allowed (service + product).
- Required vs optional items are stored for future checkout UX.
- Packages themselves are not booked as a single resource; bookable services inside a package use their own `AvailabilityLink`s when booked individually.

## Example

Room stay service + breakfast product → `Room + Breakfast` package with bundle price.

## API

Create via `POST /commerce/offerings` with `kind: "package"` and `packageItems`.
