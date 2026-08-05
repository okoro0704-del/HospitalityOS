# Integrations — TrustID & LifeOS

HospitalityOS integrates **only** through published protocols. It does not embed TrustID or LifeOS databases.

## TrustID

| HospitalityOS does | HospitalityOS does not |
|--------------------|-------------------------|
| Rely on TrustID identity **indirectly** via LifeOS | Call TrustID APIs for guest login |
| | Store TrustID access tokens, passkeys, or documents |

Identity proof remains TrustID’s responsibility. LifeOS is the broker.

## LifeOS — Experience Session Protocol

Aligned with LifeOS `experience-session-protocol`:

| Step | Endpoint / artifact |
|------|---------------------|
| JWKS | `GET {LIFEOS_API}/.well-known/experience-keys` |
| Exchange | `POST {LIFEOS_API}/experience-sessions/exchange` |
| Introspect | `POST {LIFEOS_API}/experience-sessions/introspect` |
| Handoff receiver | Guest PWA `/auth/lifeos` |
| Local session | `POST /auth/guest/exchange` on HospitalityOS |

### Token verification

- Algorithm: EdDSA (Ed25519)
- Issuer: `lifeos`
- Audience: tenant `experienceId`
- Claims used: `sub`, `sid`, `jti`, `experience_id`, `business_id`, `scopes`, `display_name?`

### Environment

```env
LIFEOS_API_URL=http://localhost:8790
LIFEOS_JWKS_URL=http://localhost:8790/.well-known/experience-keys
LIFEOS_EXPECTED_ISSUER=lifeos
```

### Registry expectation

Each HospitalityOS tenant that accepts guests should be registered in LifeOS with:

- `experienceId` matching HospitalityOS `Tenant.experienceId`
- `approvedOrigin` pointing at the Guest PWA origin (e.g. `http://localhost:5180`)

## LifeOS Business Portal (future)

Staff SSO will follow the same pattern: short-lived signed authorization → HospitalityOS local staff session. Sprint 1 keeps password login as a stand-in.
