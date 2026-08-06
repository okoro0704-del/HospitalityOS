# Payments & Billing Foundation

HospitalityOS has **one shared billing engine** for every vertical.

## Separation of concerns

```text
Commerce → Billable Items → Invoice → Payment Intent → Provider → Payment → Settlement
```

- Commerce: what is bought  
- Billing: what is owed  
- Payment: how it is paid  
- Settlement: where funds settle (records only in Sprint 13)

## Money

Amounts are **integer minor units** + `currency` (`NGN`, `USD`, `GBP`, `EUR`). No floats.

## Mock provider

Deterministic scenarios: `success`, `requires_action`, `fail_auth`, `fail_capture`, `timeout`, `refund_fail`.

## Related docs

- [BILLING.md](./BILLING.md)
- [PAYMENT_PROVIDERS.md](./PAYMENT_PROVIDERS.md)
- [INVOICE_MODEL.md](./INVOICE_MODEL.md)
- [REFUNDS.md](./REFUNDS.md)
- [TAX_MODEL.md](./TAX_MODEL.md)
- [SETTLEMENTS.md](./SETTLEMENTS.md)
- [PAYMENT_SECURITY.md](./PAYMENT_SECURITY.md)
