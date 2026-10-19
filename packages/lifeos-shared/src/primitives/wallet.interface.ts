export type InitiatePaymentPayload = {
  payerTrustId: string;
  payeeId: string;
  amount: number;
  currency: string;
  reference?: string;
  escrow?: boolean;
  metadata?: Record<string, unknown>;
};

export type PaymentResult = {
  paymentId: string;
  status: "pending" | "authorized" | "settled" | "failed" | "escrow_held" | "escrow_released";
  amount: number;
  currency: string;
  receiptId?: string;
  message?: string;
};

export type WalletBalanceSummary = {
  userId: string;
  currency: string;
  available: number;
  pending: number;
  formattedAvailable: string;
};

export type BillPaymentPayload = {
  payerTrustId: string;
  billId: string;
  amount: number;
  currency: string;
  passThrough: Record<string, unknown>;
};

/** Split escrow release to cook + rider wallets after delivery confirmation. */
export type ReleaseEscrowPayload = {
  paymentId: string;
  currency: string;
  cookWalletId: string;
  cookAmount: number;
  riderWalletId: string;
  riderAmount: number;
  reference?: string;
  metadata?: Record<string, unknown>;
};

export interface IFundzManWalletProvider {
  readonly primitiveId: "fundzman";
  readonly bound: boolean;
  health(): Promise<{ ok: boolean; service?: string }>;
  initiatePayment(payload: InitiatePaymentPayload): Promise<PaymentResult>;
  billPassThrough(payload: BillPaymentPayload): Promise<PaymentResult>;
  getWalletSummary(userId: string): Promise<WalletBalanceSummary>;
  /** Lock funds in escrow (local food delivery). Defaults to initiatePayment({ escrow: true }). */
  lockEscrow?(payload: InitiatePaymentPayload): Promise<PaymentResult>;
  /** Atomic cook + rider payout release after Trust ID delivery PIN. */
  releaseEscrow?(payload: ReleaseEscrowPayload): Promise<PaymentResult>;
}
