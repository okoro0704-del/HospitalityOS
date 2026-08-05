# Membership Model

## Entities

| Entity | Purpose |
|--------|---------|
| `MembershipPlan` | Configurable plan (duration, price, access rules, benefits) |
| `Membership` | A customer’s subscription instance |
| `MembershipPeriod` | Contiguous active periods (activate / renew) |
| `MembershipFreeze` | Pause records with reason and resume timestamps |
| `MembershipBenefit` | Named benefits attached to a plan |
| `MemberProfile` | Fitness-facing profile keyed by `(tenantId, customerId)` |

## Statuses

`draft` · `pending` · `active` · `frozen` · `expired` · `cancelled`

## Lifecycle actions

| Action | From → To |
|--------|-----------|
| Activate | draft/pending/expired/cancelled → active |
| Freeze | active → frozen |
| Resume | frozen → active |
| Cancel | → cancelled |
| Expire | → expired |
| Renew | → active (new period) |

## Commerce integration

Creating a plan calls `createOffering` with `moduleId: gym_membership`, `kind: product`, and stores `MembershipPlan.offeringId`. Prices and promotions stay in the Commerce Engine.

## Identity mapping

`MemberProfile.customerId` points at the tenant `Customer`. When the guest arrives via LifeOS → HospitalityOS experience handoff, `Customer.lifeosUserId` / `trustId` already identify them. Fitness does not add a second auth system.
