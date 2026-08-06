# Client Workflow

## Identity

`SpaClientProfile` is keyed by `(tenantId, customerId)`. Customers created via LifeOS → HospitalityOS handoff keep `lifeosUserId` / `trustId`. Spa does not add authentication.

## Profile fields

Preferences JSON, optional allergies/sensitivities (minimize collection), preferred therapist, staff notes.

## Consultations & treatment notes

Staff-only. Roles in `SPA_SENSITIVE_NOTE_ROLES` may create/read. Guests never see internal notes.

## Aftercare

`AftercareNote` with `visibleToGuest: true` appears on Guest PWA (`/guest/spa/aftercare`, spa home). Internal completion notes stay staff-only.

## History

Appointments and aftercare provide visit history for guests; staff see full appointment and note history.
