import type {
  BillPaymentPayload,
  IFundzManWalletProvider,
  IJobDispatcher,
  IMasterDistributorClient,
  IMessagingProvider,
  IStorageProvider,
  ITrustIdProvider,
  InitiatePaymentPayload,
  JobEnqueueInput,
  MessagingSendInput,
  PaymentResult,
  ReleaseEscrowPayload,
  StorageObjectRef,
  TrustIdSessionProof,
  WalletBalanceSummary,
} from "@lifeos/shared";
import { createHash, randomUUID } from "node:crypto";

export class LocalTrustIdAdapter implements ITrustIdProvider {
  readonly primitiveId = "trust-id" as const;
  readonly bound = true;
  async health() {
    return { ok: true, service: "trustid-local" };
  }
  async resolveSession(sessionToken: string): Promise<TrustIdSessionProof | null> {
    if (!sessionToken) return null;
    return { trustId: "TD-LOCAL", sessionToken, trustTier: 1, verified: true };
  }
}

export class LocalElfComMessagingAdapter implements IMessagingProvider {
  readonly primitiveId = "elfcom" as const;
  readonly bound = true;
  private threads = new Map<string, { id: string; subject?: string }>();
  async health() {
    return { ok: true, service: "elfcom-local" };
  }
  async listThreads(ownerTrustId: string) {
    return [...this.threads.values()].map((t) => ({
      id: t.id,
      subject: t.subject,
      updatedAt: new Date().toISOString(),
    }));
  }
  async sendMessage(input: MessagingSendInput) {
    this.threads.set(input.threadId, { id: input.threadId });
    return { messageId: `local_msg_${randomUUID()}` };
  }
}

export class LocalSovereignDriveAdapter implements IStorageProvider {
  readonly primitiveId = "sovereign-drive" as const;
  readonly bound = true;
  private store = new Map<string, { body: Uint8Array; contentType?: string }>();
  async health() {
    return { ok: true, service: "sovereign-drive-local" };
  }
  async put(input: {
    namespace: string;
    key: string;
    body: Uint8Array | string;
    contentType?: string;
  }): Promise<StorageObjectRef> {
    const body = typeof input.body === "string" ? Buffer.from(input.body) : input.body;
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
    this.store.set(`${input.namespace}:${input.key}`, { body: bytes, contentType: input.contentType });
    return {
      namespace: input.namespace,
      key: input.key,
      contentType: input.contentType,
      sizeBytes: bytes.byteLength,
    };
  }
  async get(input: { namespace: string; key: string }) {
    return this.store.get(`${input.namespace}:${input.key}`) ?? null;
  }
}

export class LocalJobDispatcherAdapter implements IJobDispatcher {
  readonly primitiveId = "platform-jobs" as const;
  readonly bound = true;
  private jobs = new Map<string, { status: string }>();
  async health() {
    return { ok: true, service: "platform-jobs-local" };
  }
  async enqueue(input: JobEnqueueInput) {
    const jobId = `local_job_${randomUUID()}`;
    this.jobs.set(jobId, { status: "queued" });
    setTimeout(() => {
      const j = this.jobs.get(jobId);
      if (j) j.status = "completed";
    }, 10);
    return { jobId, status: input.delayMs ? ("scheduled" as const) : ("queued" as const) };
  }
  async getStatus(jobId: string) {
    return { jobId, status: this.jobs.get(jobId)?.status ?? "unknown" };
  }
}

export class LocalMasterDistributorClient implements IMasterDistributorClient {
  readonly primitiveId = "master-distributor" as const;
  readonly bound = true;
  private seq = 0;
  async health() {
    return { ok: true, service: "master-distributor-local" };
  }
  async requestDeploy(input: { shellId: string; artifactTag: string }) {
    this.seq += 1;
    return {
      deploymentId: `local_dep_${this.seq}`,
      status: "accepted" as const,
      url: `https://local.dev/${input.shellId}`,
    };
  }
  async getDeployment(deploymentId: string) {
    return { deploymentId, status: "accepted" as const };
  }
}

export class LocalFundzManAdapter implements IFundzManWalletProvider {
  readonly primitiveId = "fundzman" as const;
  readonly bound = true;
  private seq = 0;
  private intents = new Map<string, { amount: number; currency: string; status: string }>();

  async health() {
    return { ok: true, service: "fundzman-local" };
  }

  async initiatePayment(payload: InitiatePaymentPayload): Promise<PaymentResult> {
    this.seq += 1;
    const paymentId = `local_pay_${this.seq}`;
    const status = payload.escrow ? "escrow_held" : "authorized";
    this.intents.set(paymentId, { amount: payload.amount, currency: payload.currency, status });
    return {
      paymentId,
      status,
      amount: payload.amount,
      currency: payload.currency,
      receiptId: `local_rcpt_${this.seq}`,
      message: "local fundzman stub",
    };
  }

  async billPassThrough(payload: BillPaymentPayload): Promise<PaymentResult> {
    this.seq += 1;
    return {
      paymentId: `local_bill_${this.seq}`,
      status: "settled",
      amount: payload.amount,
      currency: payload.currency,
      receiptId: `local_bill_rcpt_${this.seq}`,
      message: "local bill pass-through",
    };
  }

  async getWalletSummary(userId: string): Promise<WalletBalanceSummary> {
    return {
      userId,
      currency: "NGN",
      available: 0,
      pending: 0,
      formattedAvailable: "₦0",
    };
  }

  async lockEscrow(payload: InitiatePaymentPayload): Promise<PaymentResult> {
    return this.initiatePayment({ ...payload, escrow: true });
  }

  async releaseEscrow(payload: ReleaseEscrowPayload): Promise<PaymentResult> {
    const held = this.intents.get(payload.paymentId);
    if (!held || held.status !== "escrow_held") {
      return {
        paymentId: payload.paymentId,
        status: "failed",
        amount: payload.cookAmount + payload.riderAmount,
        currency: payload.currency,
        message: "escrow not found or not held",
      };
    }
    held.status = "escrow_released";
    this.seq += 1;
    return {
      paymentId: payload.paymentId,
      status: "escrow_released",
      amount: payload.cookAmount + payload.riderAmount,
      currency: payload.currency,
      receiptId: `local_escrow_rcpt_${this.seq}`,
      message: `released cook=${payload.cookWalletId} rider=${payload.riderWalletId}`,
    };
  }

  /** Test helper — settle an authorized payment */
  settle(paymentId: string) {
    const row = this.intents.get(paymentId);
    if (row) row.status = "settled";
  }
}

/** Deterministic content hash helper for local drive diagnostics */
export function hashBytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
