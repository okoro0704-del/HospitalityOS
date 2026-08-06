export type ProviderIntentResult = {
  providerRef: string;
  status: "created" | "requires_action" | "authorized" | "failed";
  requiresAction?: boolean;
};

export type ProviderCaptureResult = {
  providerRef: string;
  status: "captured" | "failed";
  feeMinor?: number;
};

export type ProviderRefundResult = {
  providerRef: string;
  status: "completed" | "failed";
};

export type ProviderWebhook = {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export interface PaymentProvider {
  id: string;
  createPaymentIntent(opts: {
    amount: number;
    currency: string;
    idempotencyKey: string;
    scenario?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderIntentResult>;
  authorize(opts: { providerRef: string; scenario?: string | null }): Promise<ProviderIntentResult>;
  capture(opts: { providerRef: string; amount: number; scenario?: string | null }): Promise<ProviderCaptureResult>;
  cancel(opts: { providerRef: string }): Promise<{ status: "cancelled" | "failed" }>;
  refund(opts: {
    providerRef: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<ProviderRefundResult>;
  getStatus(opts: { providerRef: string }): Promise<string>;
  verifyWebhook(opts: { payload: Record<string, unknown>; signature?: string }): Promise<ProviderWebhook>;
}

/** Interface placeholders for future adapters — not registered in Sprint 13. */
export interface GenericCardProvider extends PaymentProvider {
  id: "card";
}
export interface BankTransferProvider extends PaymentProvider {
  id: "bank_transfer";
}
export interface WalletProvider extends PaymentProvider {
  id: "wallet";
}
/** Future TokenNetworkPaymentProvider can implement PaymentProvider without changing billing. */
export interface TokenNetworkPaymentProvider extends PaymentProvider {
  id: "token_network";
}

/**
 * Deterministic mock provider — scenarios via `scenario` string (no randomness).
 * Scenarios: success | requires_action | fail_auth | fail_capture | timeout | refund_fail
 */
export class MockPaymentProvider implements PaymentProvider {
  id = "mock";
  private store = new Map<
    string,
    { amount: number; currency: string; status: string; fee: number; scenario: string }
  >();

  async createPaymentIntent(opts: {
    amount: number;
    currency: string;
    idempotencyKey: string;
    scenario?: string | null;
  }): Promise<ProviderIntentResult> {
    const scenario = opts.scenario ?? "success";
    if (scenario === "timeout") {
      throw Object.assign(new Error("Provider timeout"), { code: "provider_timeout", statusCode: 504 });
    }
    const providerRef = `mock_pi_${opts.idempotencyKey}`;
    const existing = this.store.get(providerRef);
    if (existing) {
      return {
        providerRef,
        status: existing.status as ProviderIntentResult["status"],
        requiresAction: existing.status === "requires_action",
      };
    }
    const status = scenario === "requires_action" ? "requires_action" : "created";
    this.store.set(providerRef, {
      amount: opts.amount,
      currency: opts.currency,
      status,
      fee: 0,
      scenario,
    });
    return { providerRef, status, requiresAction: status === "requires_action" };
  }

  async authorize(opts: { providerRef: string; scenario?: string | null }): Promise<ProviderIntentResult> {
    const row = this.store.get(opts.providerRef);
    if (!row) throw Object.assign(new Error("Unknown intent"), { code: "not_found", statusCode: 404 });
    const scenario = opts.scenario ?? row.scenario;
    if (scenario === "fail_auth") {
      row.status = "failed";
      return { providerRef: opts.providerRef, status: "failed" };
    }
    row.status = "authorized";
    return { providerRef: opts.providerRef, status: "authorized" };
  }

  async capture(opts: {
    providerRef: string;
    amount: number;
    scenario?: string | null;
  }): Promise<ProviderCaptureResult> {
    const row = this.store.get(opts.providerRef);
    if (!row) throw Object.assign(new Error("Unknown intent"), { code: "not_found", statusCode: 404 });
    const scenario = opts.scenario ?? row.scenario;
    if (scenario === "fail_capture") {
      return { providerRef: opts.providerRef, status: "failed" };
    }
    row.status = "captured";
    row.fee = Math.round(opts.amount * 0.029); // deterministic mock fee ~2.9%
    return { providerRef: opts.providerRef, status: "captured", feeMinor: row.fee };
  }

  async cancel(opts: { providerRef: string }) {
    const row = this.store.get(opts.providerRef);
    if (!row) return { status: "failed" as const };
    row.status = "cancelled";
    return { status: "cancelled" as const };
  }

  async refund(opts: {
    providerRef: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<ProviderRefundResult> {
    const row = this.store.get(opts.providerRef);
    if (!row) return { providerRef: `mock_re_${opts.idempotencyKey}`, status: "failed" };
    if (row.scenario === "refund_fail") {
      return { providerRef: `mock_re_${opts.idempotencyKey}`, status: "failed" };
    }
    return { providerRef: `mock_re_${opts.idempotencyKey}`, status: "completed" };
  }

  async getStatus(opts: { providerRef: string }) {
    return this.store.get(opts.providerRef)?.status ?? "unknown";
  }

  async verifyWebhook(opts: { payload: Record<string, unknown>; signature?: string }) {
    // Mock: accept any payload; signature ignored (no secrets in client)
    const eventId = String(opts.payload.eventId ?? opts.payload.id ?? "");
    if (!eventId) {
      throw Object.assign(new Error("Missing eventId"), { code: "invalid_webhook", statusCode: 400 });
    }
    return {
      eventId,
      eventType: String(opts.payload.eventType ?? opts.payload.type ?? "payment.updated"),
      payload: opts.payload,
    };
  }

  /** Simulate provider webhook confirmation after capture. */
  buildCaptureWebhook(providerRef: string, tenantId: string) {
    return {
      eventId: `wh_${providerRef}_captured`,
      eventType: "payment.captured",
      providerRef,
      tenantId,
      status: "captured",
    };
  }
}

const mock = new MockPaymentProvider();

export function getPaymentProvider(id = "mock"): PaymentProvider {
  if (id === "mock") return mock;
  // Future: card / bank_transfer / wallet / token_network adapters register here
  return mock;
}
