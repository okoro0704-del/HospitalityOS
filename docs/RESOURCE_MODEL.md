# Resource Model

Every reservable thing in HospitalityOS is a **Bookable Resource**. Resource “type” is not a hard-coded enum — modules and admins describe resources with categories, tags, metadata, and custom fields.

## BookableResource

| Field | Notes |
|-------|-------|
| `id` | Unique identifier |
| `tenantId` | Isolation boundary |
| `categoryId` | Admin-defined `ResourceCategory` |
| `moduleId` | Owning business module (`accommodation`, `events`, …) |
| `branchId` | Optional branch scope |
| `name` / `code` | Display + unique-per-tenant code |
| `capacity` | Concurrent units (1 = exclusive, N = shared) |
| `status` | `available`, `unavailable`, `maintenance`, `blocked`, `retired` |
| `tags` | Free-form labels |
| `metadata` / `customFields` | Extensible JSON |
| `sourceType` / `sourceId` | Optional link to a module entity (e.g. room) |

Unique: `(tenantId, code)` and `(tenantId, sourceType, sourceId)`.

## Resource categories

Default categories bootstrap per tenant (`DEFAULT_RESOURCE_CATEGORIES`):

Accommodation, Dining, Fitness, Wellness, Events, Entertainment, Rental, Workspace, Tourism.

Admins can add more via `POST /booking/categories` — no migration required.

## Example mappings (future)

| Module concept | Resource |
|----------------|----------|
| Room | BookableResource (`sourceType: accommodation_room`) |
| Table | BookableResource + dining category |
| Treatment room | Wellness category |
| Fitness class | Fitness category + capacity = class size |
| Seat / hall / equipment | Entertainment / events / rental |

## Related entities

- **BookingItem** — quantity of a resource inside a booking window
- **ResourceSchedule** / **TimeSlot** — when the resource is offered
- **BlackoutPeriod** — when it is not
- **ResourceAssignment** — staff/guides attached to a resource
- **WaitlistEntry** — demand when capacity is exhausted

## Accommodation sync

`syncRoomToBookableResource` upserts a resource for each room so the stay module and the universal engine share inventory for conflict detection.
