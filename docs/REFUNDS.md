# Refunds

Full and partial refunds against captured payments.

- Refund amount cannot exceed `capturedAmount - refundedAmount`
- Cannot refund before capture
- Idempotency keys prevent duplicate refunds
- Statuses: requested, processing, completed, failed, cancelled
