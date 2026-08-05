# Order Workflow

## Order types

`dine_in` | `takeaway` | `delivery` | `room_service`

Delivery and room service are foundations (typed orders only).

## Lifecycle

```text
draft → submitted → preparing → ready → served → completed
                 ↘ cancelled
```

## Submit behavior

On `submitted`:

- Kitchen tickets are created (one per station linked to items, or a general ticket)
- Guest notification: order accepted
- Staff kitchen alert notification
- Audit: `dining_order.transition`

## Pricing

Subtotal from line items; optional `ServiceChargeRule` percent/amount; bill fields (`billStatus`, `splitCount`) are placeholders for a future payments sprint.

## API

- `POST /dining/orders`
- `POST /dining/orders/:id/transition`
- `GET /dining/orders`
