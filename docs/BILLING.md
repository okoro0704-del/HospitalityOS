# Billing

## Module

`billing` (gated). Staff need billing permissions (`billing.view`, `billing.create`, …) — not all roles get financial access.

## Core flows

1. Create invoice from lines / billable items  
2. Create payment intent (idempotent)  
3. Authorize + capture via provider (or record cash)  
4. Issue receipt  
5. Optional refund / credit note  
6. Settlement record (gross / fee / net)

## APIs

Staff: `/billing/invoices`, `/billing/payments`, `/billing/payment-intents`, `/billing/refunds`, `/billing/receipts`, `/billing/credit-notes`, `/billing/taxes`, `/billing/settlements`, `/billing/webhooks`, `/billing/dashboard`

Guest: `/guest/billing`, `/guest/billing/invoices`, `/guest/billing/payments`, `/guest/billing/receipts`, mock pay via payment intents

## Vertical adapters

`billAccommodation`, `billDining`, `billFitness`, `billSpa`, `billEvents`, `billCinema`, `billCommerce` — pass final commercial amounts; do not re-price.
