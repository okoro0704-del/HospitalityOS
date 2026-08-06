# Payment Providers

## Interface

`createPaymentIntent`, `authorize`, `capture`, `cancel`, `refund`, `getStatus`, `verifyWebhook`

## Sprint 13

| Provider | Status |
|----------|--------|
| MockPaymentProvider | Functional, deterministic |
| GenericCardProvider | Interface |
| BankTransferProvider | Interface |
| WalletProvider | Interface |
| TokenNetworkPaymentProvider | Interface (future; not a ledger replacement) |

Domain billing logic never depends on a specific processor. Future real adapters plug into `getPaymentProvider()`.
