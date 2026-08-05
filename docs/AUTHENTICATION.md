# Authentication

## Guest flow (TrustID → LifeOS → HospitalityOS)

```text
1. Guest signs into LifeOS with TrustID
2. LifeOS creates ExperienceSession + one-time handoff
3. Browser opens Guest PWA:
   /auth/lifeos?handoff=…&experience_id=…
4. Guest PWA → HospitalityOS API POST /auth/guest/exchange
5. API exchanges handoff with LifeOS
6. API verifies JWT via LifeOS JWKS (iss, aud, exp, EdDSA)
7. API introspects jti (revocation)
8. API upserts tenant Customer + creates local GuestSession
9. Guest PWA stores OS-local session (sessionStorage + cookie)
```

### Hard rules

- Query params such as `?user=` / `?trustId=` / `?permissions=` **must never** authenticate.
- TrustID tokens are never stored or accepted by HospitalityOS.
- Local session lifetime is bound to LifeOS token `exp` (capped by local TTL).
- Guest logout clears HospitalityOS only; LifeOS session is separate.

## Staff flow (Sprint 1)

```text
Staff Web → POST /auth/staff/login { tenantSlug, email, password }
         → local StaffSession (cookie + bearer token)
```

Roles: `owner` · `admin` · `manager` · `front_desk` · `operations` · `viewer`

Role checks gate sensitive routes (module toggle, staff list, audit logs, branding).

## Future: LifeOS Business Portal

Staff authentication is designed to swap the password login for a Business Portal handoff analogous to the guest experience-session protocol, without changing tenant isolation or role model.
