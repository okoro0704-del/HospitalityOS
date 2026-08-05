# Kitchen Display

Software kitchen ticket board — no printer/KDS hardware integrations.

## Ticket model

`KitchenTicket`: order, optional station, status, priority, notes, fired/ready timestamps.

Statuses: `queued` → `preparing` → `ready` → `served` (or `cancelled`).

## Station assignment

`KitchenStation` entities; menu items may reference a station so submit fans out tickets per station.

## Staff UI

`/dining/kitchen` lists tickets with start / mark-ready actions.

## API

- `GET /dining/kitchen/tickets`
- `PATCH /dining/kitchen/tickets/:id`
- `GET/POST /dining/stations`
