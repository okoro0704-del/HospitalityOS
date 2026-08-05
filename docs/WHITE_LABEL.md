# Future White-Label Strategy

Sprint 1 prepares the **data model**, not the deployment pipeline.

## Already modeled

Per tenant:

- Business name & slug
- Logo URL
- Theme (`light` | `dark` | `system`)
- Brand colours (primary / secondary / accent)
- Optional font family
- Contact details
- Operating hours
- Branches
- Enabled modules
- Settings JSON blob

Public read: `GET /tenants/:slug/public`

Staff read/update: `/tenant`, `/tenant/branding`

## Planned (not in Sprint 1)

```text
custom domain  →  tenant resolution middleware
             →  inject branding into Guest PWA + Staff Web
             →  optional separate deploy / edge config
```

| Capability | Approach |
|------------|----------|
| Custom domains | Host header → tenant slug map |
| Themed runtimes | CSS variables from tenant branding |
| App store wrappers | Same Guest PWA with tenant bootstrap |
| Isolated enterprise deploys | Same image, different `DATABASE_URL` / secrets |

White-label must never weaken tenant isolation — branding is presentation only.
