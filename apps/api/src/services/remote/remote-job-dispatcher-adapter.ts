import type { DispatchJobOptions, IJobDispatcher } from "@hospitalityos/shared";
import { resolveAccessToken, type AccessTokenFactory } from "./access-token.js";

export interface RemoteJobDispatcherAdapterOptions {
  /** Base URL of Platform Jobs, e.g. http://localhost:3000 */
  baseUrl: string;
  getAccessToken: AccessTokenFactory;
  fetchFn?: typeof fetch;
}

export type RemoteJobStatus =
  | "DISPATCHED"
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "DEAD";

/**
 * Remote Jobs adapter — proxies IJobDispatcher to Platform Jobs `/v1/jobs`.
 */
export class RemoteJobDispatcherAdapter implements IJobDispatcher {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenFactory;
  private readonly fetchFn: typeof fetch;

  constructor(opts: RemoteJobDispatcherAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.getAccessToken = opts.getAccessToken;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async dispatch(options: DispatchJobOptions): Promise<{ jobId: string; status: "DISPATCHED" }> {
    const token = await resolveAccessToken(this.getAccessToken);
    const body = {
      jobName: options.jobName,
      payload: options.payload,
      delayMs: options.delayMs,
      scheduledAt:
        options.scheduledAt instanceof Date
          ? options.scheduledAt.toISOString()
          : options.scheduledAt,
      deduplicationKey: options.deduplicationKey,
    };

    const response = await this.fetchFn(`${this.baseUrl}/v1/jobs/dispatch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Platform Jobs dispatch failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { jobId: string; status?: string };
    return { jobId: data.jobId, status: "DISPATCHED" };
  }

  /** Poll job status (control-plane helper; not part of IJobDispatcher). */
  async getStatus(jobId: string): Promise<{ jobId: string; status: RemoteJobStatus }> {
    const token = await resolveAccessToken(this.getAccessToken);
    const response = await this.fetchFn(`${this.baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Platform Jobs getStatus failed (${response.status}): ${text}`);
    }
    const data = (await response.json()) as { jobId: string; status: RemoteJobStatus };
    return data;
  }
}
