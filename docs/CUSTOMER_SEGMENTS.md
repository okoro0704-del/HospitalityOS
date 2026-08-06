# Customer Segments

Rule-based segmentation for staff. No machine-learning scores.

## Model

`CustomerSegment`: tenant-scoped name, code, description, and `rules` JSON.

## Supported rules (v1)

| Rule | Meaning |
|------|---------|
| `tagCode` | Customer has this tag |
| `minBookings` | Booking count ≥ N |
| `lastVisitDays` | Last visit (or createdAt fallback) within N days |
| `membershipStatus` | Reserved for fitness membership filters |

Example:

```json
{ "lastVisitDays": 30, "tagCode": "VIP" }
```

## Evaluation

`GET /segments/:id/members` evaluates rules in-process against the tenant’s customers. Results are not cached memberships — re-run on demand.

## Examples

- VIP Customers (`tagCode: "VIP"`)
- Visited in last 30 days (`lastVisitDays: 30`)
- Frequent bookers (`minBookings: 5`)
