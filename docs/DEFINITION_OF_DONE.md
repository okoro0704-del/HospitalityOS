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

## Sprint 7 — Spa & Wellness Module

| Criterion | Status |
|-----------|--------|
| Spa & Wellness functional module | Done |
| Treatments via Commerce Engine | Done |
| Appointments via Booking Engine | Done |
| Therapists & rooms schedulable | Done |
| Double-booking prevented | Done |
| Wellness facility reservations | Done |
| Packages & memberships | Done |
| Guest PWA spa experience | Done |
| Staff Web spa operations | Done |
| Sensitive notes role-protected | Done |
| TrustID/LifeOS unchanged | Done |
| Tenant isolation intact | Done |
| Prior modules non-regression | Done |
| Automated tests | Done (`test/sprint7.test.ts`) |
| Documentation | Done (`SPA_MODULE.md`, `SPA_BOOKING.md`, `TREATMENT_CATALOG.md`, `THERAPIST_WORKFLOW.md`, `CLIENT_WORKFLOW.md`) |

## Sprint 8 — Events & Venues Module

| Criterion | Status |
|-----------|--------|
| Events & Venues functional module | Done |
| Venues + Booking Engine | Done |
| Event lifecycle & sessions | Done |
| Tickets via Commerce | Done |
| Capacity + concurrent oversale protection | Done |
| General admission & assigned seating | Done |
| Venue rental via Booking | Done |
| Packages & add-ons via Commerce | Done |
| Attendees & check-in | Done |
| Guest PWA event discovery & booking | Done |
| TrustID/LifeOS unchanged | Done |
| Tenant isolation intact | Done |
| Prior modules non-regression | Done |
| Automated tests | Done (`test/sprint8.test.ts`) |
| Documentation | Done (`EVENTS_MODULE.md`, `VENUE_MODEL.md`, `TICKETING.md`, `SEATING.md`, `EVENT_CHECKIN.md`, `EVENT_BOOKING.md`) |

## Sprint 9 — Cinema & Entertainment Module

| Criterion | Status |
|-----------|--------|
| Cinema & Entertainment functional module | Done |
| Venues with multiple screens | Done |
| Configurable seating | Done |
| Content & showtime lifecycle | Done |
| Showtimes via Booking Engine | Done |
| Tickets via Commerce | Done |
| Assigned seating & general admission | Done |
| Temporary holds + expiration | Done |
| Concurrent oversale protection | Done |
| Guest browse & book | Done |
| Staff cinema operations | Done |
| Check-in | Done |
| Concessions via Commerce | Done |
| TrustID/LifeOS unchanged | Done |
| Tenant isolation intact | Done |
| Prior modules non-regression | Done |
| Automated tests | Done (`test/sprint9.test.ts`) |
| Documentation | Done (`CINEMA_MODULE.md`, `SCREEN_MODEL.md`, `SHOWTIME_MODEL.md`, `SEATING_MODEL.md`, `SEAT_HOLDS.md`, `CINEMA_TICKETING.md`, `CONCESSIONS.md`) |

## Sprint 10 — Operations & Inventory Foundation

| Criterion | Status |
|-----------|--------|
| Shared inventory foundation | Done |
| Locations, items, balances | Done |
| Transactional mutations + transfers | Done |
| Stock counts with auditable adjustments | Done |
| Reorder alerts (no auto-purchase) | Done |
| Suppliers & purchase requests | Done |
| Assets & maintenance | Done |
| Operational tasks | Done |
| Optional Commerce inventory link | Done |
| Concurrent negative-stock protection | Done |
| Audit logging | Done |
| TrustID/LifeOS unchanged | Done |
| Tenant isolation intact | Done |
| Prior modules non-regression | Done |
| Automated tests | Done (`test/sprint10.test.ts`) |
| Documentation | Done (`OPERATIONS.md`, `INVENTORY.md`, `INVENTORY_TRANSACTIONS.md`, `STOCK_COUNTS.md`, `ASSET_MANAGEMENT.md`, `MAINTENANCE.md`, `OPERATIONAL_TASKS.md`) |

## Sprint 11 — CRM & Customer Management Foundation

| Criterion | Status |
|-----------|--------|
| One shared CRM across verticals | Done |
| Customer search (tenant-scoped) | Done |
| Customer profiles (staff + guest) | Done |
| Preferences, tags, notes (role-protected) | Done |
| Consent records + audit | Done |
| Timeline with vertical providers | Done |
| Segments (rule-based) | Done |
| Feedback + loyalty foundation (no tokens) | Done |
| TrustID remains external identity authority | Done |
| Tenant isolation absolute | Done |
| Merge requires confirmation; UI disabled | Done |
| Prior modules non-regression | Done |
| Automated tests | Done (`test/sprint11.test.ts`) |
| Documentation | Done (`CRM.md`, `CUSTOMER_*.md`) |

## Sprint 12 — Communications & Notification Foundation

| Criterion | Status |
|-----------|--------|
| One shared communication engine | Done |
| In-app notifications (guest + staff) | Done |
| Templates + rules + deliveries | Done |
| Event → notification pipeline | Done |
| Deep links | Done |
| Preferences + marketing consent | Done |
| Scheduling + idempotency + retries | Done |
| Mock email/SMS/push adapters | Done |
| Tenant + audience isolation | Done |
| Audit logging | Done |
| Prior modules non-regression | Done |
| Automated tests | Done (`test/sprint12.test.ts`) |
| Documentation | Done (`NOTIFICATIONS.md`, `COMMUNICATION_*.md`, …) |

## Sprint 13 — Payments & Billing Foundation

| Criterion | Status |
|-----------|--------|
| One shared billing engine | Done |
| Invoices + lines + billable items | Done |
| Payment intents + mock provider lifecycle | Done |
| Refunds (full/partial) + cash + receipts | Done |
| Tax foundation + discounts recorded | Done |
| Settlements + webhook idempotency | Done |
| Financial idempotency + concurrency | Done |
| Tenant isolation + billing permissions | Done |
| Guest + staff billing UIs | Done |
| Vertical billable adapters | Done |
| No raw payment credentials | Done |
| TrustID/LifeOS untouched | Done |
| Prior modules non-regression | Done |
| Automated tests | Done (`test/sprint13.test.ts`) |
| Documentation | Done (`PAYMENTS.md`, `BILLING.md`, …) |

## Explicitly out of scope

Payments real providers, medical diagnosis/records, insurance, POS/turnstile/biometric/ticket-scanning hardware, inventory auto-deduction from orders, accounting ledger, payroll, token/crypto networks, external procurement, supplier marketplaces, Business Portal SSO, identity verification, real email/SMS/push/WhatsApp, marketing automation, AI messaging, cross-tenant CRM sharing.

