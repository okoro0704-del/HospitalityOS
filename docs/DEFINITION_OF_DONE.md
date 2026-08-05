# Sprint 1 — Definition of Done

| Criterion | Status |
|-----------|--------|
| HospitalityOS exists as an independent full-stack project | Done |
| Backend API operational | Done (`apps/api`, port 8800) |
| Guest PWA shell operational | Done (`apps/guest-pwa`, port 5180) |
| Staff Web shell operational | Done (`apps/staff-web`, port 5181) |
| Multi-tenant architecture implemented | Done |
| Tenant isolation enforced | Done (tests cover cross-tenant 404) |
| Module registry exists | Done (`MODULE_CATALOG` + `TenantModule`) |
| Businesses can enable/disable modules | Done (`PUT /tenant/modules/:id`) |
| Branding & business configuration models | Done |
| Guest & Staff application shells complete | Done |
| LifeOS experience-session integration | Done (`/auth/guest/exchange` + `/auth/lifeos`) |
| Automated tests pass | Done (`npm test`) |
| Documentation complete | Done (`docs/`) |

## Sprint 2 — Accommodation

| Criterion | Status |
|-----------|--------|
| Accommodation is a functional, module-gated feature | Done |
| Multiple properties per tenant | Done |
| Room types & rooms configurable | Done |
| Reservation lifecycle | Done |
| Check-in / check-out | Done |
| Housekeeping & maintenance affect availability | Done |
| Guest profiles + LifeOS mapping | Done |
| Staff Web accommodation ops | Done |
| Guest PWA browse & reserve | Done |
| Tenant isolation preserved | Done |
| Automated tests | Done (`test/sprint2.test.ts`) |
| Documentation updated | Done |

## Sprint 3 — Universal Booking & Scheduling Engine

| Criterion | Status |
|-----------|--------|
| One reusable Booking & Scheduling Engine | Done |
| Accommodation consumes the engine without UX regressions | Done |
| Generic resources can be scheduled | Done |
| Centralized availability & conflict detection | Done |
| Waitlists & booking policies | Done |
| Staff Web manages resources/schedules/policies/calendar | Done |
| Guest PWA books via generic engine | Done |
| Entities remain tenant-aware | Done |
| Automated tests | Done (`test/sprint3.test.ts`) |
| Documentation | Done (`BOOKING_ENGINE.md`, `SCHEDULING_ENGINE.md`, `RESOURCE_MODEL.md`, `API_BOOKING.md`) |

## Sprint 4 — Universal Commerce & Catalog Engine

| Criterion | Status |
|-----------|--------|
| Reusable Commerce & Catalog Engine | Done |
| Services, products, packages in one catalog | Done |
| Centralized pricing & promotions | Done |
| Services integrate with Booking Engine | Done |
| Products independent of booking | Done |
| Packages support mixed offerings | Done |
| Guest PWA browse + book eligible services | Done |
| Staff Web catalog management | Done |
| Tenant-aware entities | Done |
| Accommodation unchanged | Done |
| Automated tests | Done (`test/sprint4.test.ts`) |
| Documentation | Done (`CATALOG_ENGINE.md`, `COMMERCE_ENGINE.md`, `PRICING_ENGINE.md`, `PROMOTIONS.md`, `PACKAGE_MODEL.md`) |

## Sprint 5 — Restaurant & Dining Module

| Criterion | Status |
|-----------|--------|
| Restaurant & Dining functional module | Done |
| Tables use Booking Engine | Done |
| Menus use Commerce Engine | Done |
| Orders & kitchen workflows | Done |
| Guest PWA menus + table reserve | Done |
| Staff Web dining ops | Done |
| Existing modules without regression | Done |
| Automated tests | Done (`test/sprint5.test.ts`) |
| Documentation | Done (`RESTAURANT_MODULE.md`, `MENU_ENGINE.md`, `ORDER_WORKFLOW.md`, `KITCHEN_DISPLAY.md`) |

## Sprint 6 — Gym, Fitness & Membership Module

| Criterion | Status |
|-----------|--------|
| Gym & Fitness functional module | Done |
| Membership lifecycle | Done |
| Plans via Commerce Engine | Done |
| Classes via Booking Engine | Done |
| Trainers & personal training | Done |
| Attendance & check-in | Done |
| Guest PWA member experience | Done |
| Staff Web gym operations | Done |
| TrustID/LifeOS unchanged | Done |
| Tenant isolation intact | Done |
| Accommodation/Restaurant non-regression | Done |
| Automated tests | Done (`test/sprint6.test.ts`) |
| Documentation | Done (`GYM_MODULE.md`, `MEMBERSHIP_MODEL.md`, `FITNESS_BOOKING.md`, `ATTENDANCE.md`, `TRAINER_WORKFLOW.md`) |

## Explicitly out of scope

Payments, POS/turnstile/biometric hardware, inventory deduction, accounting, payroll, token payments, Business Portal SSO.

