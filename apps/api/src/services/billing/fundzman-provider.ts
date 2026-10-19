import type { IFundzManWalletProvider } from "@lifeos/shared";
import { getFundzManWalletProvider } from "../lifeos/container.js";
import type {
  PaymentProvider,
  ProviderCaptureResult,
  ProviderIntentResult,
  ProviderRefundResult,
  ProviderWebhook,
} from "./providers.js";

/**
 * Bridges HospitalityOS PaymentProvider surface to LifeOS IFundzManWalletProvider.
 * Uses /v1/wallet/pay (initiate) and bill pass-through for settlement semantics.
 */
export class FundzManPaymentProvider implements PaymentProvider {
  id = "fundzman";
  private readonly wallet: IFundzManWalletProvider;
  private store = new Map<
    string,
    { amount: number; currency: string; status: string; payerTrustId: string; payeeId: string }
  >();

  constructor(wallet?: IFundzManWalletProvider) {
    this.wallet = wallet ?? getFundzManWalletProvider();
  }

  async createPaymentIntent(opts: {
    amount: number;
    currency: string;
    idempotencyKey: string;
    scenario?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderIntentResult> {
    if (opts.scenario === "timeout") {
      throw Object.assign(new Error("Provider timeout"), { code: "provider_timeout", statusCode: 504 });
    }
    const existingKey = `fundz_pi_${opts.idempotencyKey}`;
    const existing = this.store.get(existingKey);
    if (existing) {
      return {
        providerRef: existingKey,
        status: existing.status === "requires_action" ? "requires_action" : "created",
        requiresAction: existing.status === "requires_action",
      };
    }

    const payerTrustId = String(opts.metadata?.payerTrustId ?? opts.metadata?.customerId ?? "guest");
    const payeeId = String(opts.metadata?.payeeId ?? opts.metadata?.tenantId ?? "merchant");

    const result = await this.wallet.initiatePayment({
      payerTrustId,
      payeeId,
      amount: opts.amount,
      currency: opts.currency,
      reference: opts.idempotencyKey,
      escrow: opts.scenario === "requires_action",
      metadata: opts.metadata,
    });

    const providerRef = result.paymentId || existingKey;
    const status =
      opts.scenario === "requires_action" || result.status === "escrow_held"
        ? "requires_action"
        : result.status === "failed"
          ? "failed"
          : "created";

    this.store.set(providerRef, {
      amount: opts.amount,
      currency: opts.currency,
      status,
      payerTrustId,
      payeeId,
    });

    return {
      providerRef,
      status: status as ProviderIntentResult["status"],
      requiresAction: status === "requires_action",
    };
  }

  async authorize(opts: { providerRef: string; scenario?: string | null }): Promise<ProviderIntentResult> {
    const row = this.store.get(opts.providerRef);
    if (!row) throw Object.assign(new Error("Unknown intent"), { code: "not_found", statusCode: 404 });
    if (opts.scenario === "fail_auth") {
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
    if (opts.scenario === "fail_capture") {
      return { providerRef: opts.providerRef, status: "failed" };
    }

    await this.wallet.billPassThrough({
      payerTrustId: row.payerTrustId,
      billId: opts.providerRef,
      amount: opts.amount,
      currency: row.currency,
      passThrough: { providerRef: opts.providerRef, action: "capture" },
    });

    row.status = "captured";
    return {
      providerRef: opts.providerRef,
      status: "captured",
      feeMinor: Math.round(opts.amount * 0.029),
    };
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
    if (!row) return { providerRef: `fundz_re_${opts.idempotencyKey}`, status: "failed" };
    await this.wallet.billPassThrough({
      payerTrustId: row.payerTrustId,
      billId: opts.providerRef,
      amount: opts.amount,
      currency: row.currency,
      passThrough: { providerRef: opts.providerRef, action: "refund", idempotencyKey: opts.idempotencyKey },
    });
    return { providerRef: `fundz_re_${opts.idempotencyKey}`, status: "completed" };
  }

  async getStatus(opts: { providerRef: string }) {
    return this.store.get(opts.providerRef)?.status ?? "unknown";
  }

  async verifyWebhook(opts: { payload: Record<string, unknown>; signature?: string }): Promise<ProviderWebhook> {
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
}
