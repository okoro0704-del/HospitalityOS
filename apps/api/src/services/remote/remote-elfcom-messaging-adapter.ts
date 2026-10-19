import type {
  IMessagingProvider,
  SendMessagePayload,
  SendMessageResult,
} from "@hospitalityos/shared";
import { resolveAccessToken, type AccessTokenFactory } from "./access-token.js";

export interface RemoteElfComMessagingAdapterOptions {
  /** Base URL of ElfCom engine, e.g. http://localhost:4000 */
  baseUrl: string;
  getAccessToken: AccessTokenFactory;
  fetchFn?: typeof fetch;
}

/**
 * Remote Messaging adapter — proxies IMessagingProvider to ElfCom `/v1/messages`.
 */
export class RemoteElfComMessagingAdapter implements IMessagingProvider {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenFactory;
  private readonly fetchFn: typeof fetch;

  constructor(opts: RemoteElfComMessagingAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.getAccessToken = opts.getAccessToken;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async sendMessage(payload: SendMessagePayload): Promise<SendMessageResult> {
    const token = await resolveAccessToken(this.getAccessToken);
    const res = await this.fetchFn(`${this.baseUrl}/v1/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientId: payload.recipientId,
        channel: payload.channel,
        templateId: payload.templateId,
        body: payload.body,
        metadata: payload.metadata,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`ElfCom sendMessage failed (${res.status}): ${errBody}`);
    }

    const data = (await res.json()) as Partial<SendMessageResult> & {
      message?: { id?: string; status?: string };
    };

    return {
      messageId: data.messageId ?? data.message?.id ?? `elfcom_${Date.now()}`,
      status: (data.status as SendMessageResult["status"]) ?? "SENT",
      timestamp: data.timestamp ?? Date.now(),
    };
  }

  async sendBatch(payloads: SendMessagePayload[]): Promise<SendMessageResult[]> {
    const token = await resolveAccessToken(this.getAccessToken);
    const res = await this.fetchFn(`${this.baseUrl}/v1/messages/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: payloads.map((p) => ({
          recipientId: p.recipientId,
          channel: p.channel,
          templateId: p.templateId,
          body: p.body,
          metadata: p.metadata,
        })),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`ElfCom sendBatch failed (${res.status}): ${errBody}`);
    }

    const data = (await res.json()) as {
      results?: SendMessageResult[];
      messages?: Array<{ id: string; status?: string }>;
    };

    if (data.results?.length) return data.results;
    if (data.messages?.length) {
      const ts = Date.now();
      return data.messages.map((m) => ({
        messageId: m.id,
        status: (m.status as SendMessageResult["status"]) ?? "SENT",
        timestamp: ts,
      }));
    }
    return [];
  }
}
