# Notification Templates

Templates are tenant-scoped and **versioned** (`code` + `version`).

## Types

- Transactional
- Operational
- Marketing (requires elevated staff roles to create via marketing endpoint)
- System

## Safe variables

Only allowlisted keys render (e.g. `{{customer.firstName}}`, `{{business.name}}`, `{{booking.reference}}`). Unknown keys render empty. Values are sanitized (no HTML / javascript URLs). Arbitrary executable template content is not supported.

## Fields

Name, category, channel, subject, body, variables JSON, status, version.
