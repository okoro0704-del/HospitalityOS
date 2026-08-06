# Customer Privacy

## Tenant isolation

Customer rows are always scoped by `tenantId`. Cross-tenant reads return `404`. There is **no** global customer directory across businesses in this sprint.

## Minimal collection

Optional PII (DOB, gender, address) is never required for CRM core flows.

## Role protection

| Data | Guests | Staff viewers | Ops / CRM roles |
|------|--------|---------------|-----------------|
| Profile summary | Yes (own) | Yes (tenant) | Yes |
| Preferences | Own only | Yes | Yes |
| Timeline (ops events) | Own only | Yes | Yes |
| Internal notes | **No** | **No** | Yes |
| Tags / segments | **No** | Yes (module on) | Yes |
| Staff interactions | **No** | Limited | Yes |
| Consent | Own via APIs as exposed | Yes | Yes |

Notes use `visibility` (`internal` / `restricted`) and role gates (`canReadInternalNotes`).

## Consent

`CustomerConsent` stores purpose, status (`granted` / `withdrawn`), timestamps, source, and policy/version. This is an audit-friendly data model — not a full legal compliance suite.

## Audit

`AuditLog` records customer create/update, preference/tag/note/consent/loyalty changes, merge, and related staff actions.

## Merge safeguards

Merges require `confirmed: true`, same-tenant source/destination, and produce a `CustomerMergeRequest` + audit entry. UI remains disabled by default.
