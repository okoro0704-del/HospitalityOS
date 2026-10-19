import type {
  IMessagingProvider,
  SendMessagePayload,
  SendMessageResult,
} from "@hospitalityos/shared";
import { getProvider, type OutboundMessage } from "./providers.js";

const CHANNEL_TO_LEGACY: Record<SendMessagePayload["channel"], string> = {
  EMAIL: "email",
  SMS: "sms",
  WHATSAPP: "whatsapp",
  IN_APP: "in_app",
  /** SYSTEM maps to legacy push mock (no dedicated SYSTEM channel yet). */
  SYSTEM: "push",
};

function mapStatus(status: string, ok: boolean): SendMessageResult["status"] {
  if (!ok || status === "failed") return "FAILED";
  if (status === "skipped") return "QUEUED";
  return "SENT";
}

function metaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Local Messaging adapter — wraps SMTP/mock/console email, SMS, push, in-app providers.
 * Optional metadata keys used by HOS: tenantId, subject, replyTo, idempotencyKey.
 */
export class LocalMessagingAdapter implements IMessagingProvider {
  async sendMessage(payload: SendMessagePayload): Promise<SendMessageResult> {
    const legacyChannel = CHANNEL_TO_LEGACY[payload.channel];
    const provider = getProvider(legacyChannel);
    const timestamp = Date.now();

    if (!provider) {
      return {
        messageId: `unavailable_${timestamp}`,
        status: "FAILED",
        timestamp,
      };
    }

    const meta = payload.metadata ?? {};
    const message: OutboundMessage = {
      tenantId: metaString(meta, "tenantId") ?? "platform",
      to: payload.recipientId,
      subject: metaString(meta, "subject") ?? null,
      body: payload.body ?? "",
      replyTo: metaString(meta, "replyTo") ?? null,
      metadata: {
        ...meta,
        ...(payload.templateId ? { templateId: payload.templateId } : {}),
      },
      idempotencyKey: metaString(meta, "idempotencyKey"),
    };

    const result = await provider.send(message);
    return {
      messageId: result.externalId ?? `${result.provider}_${timestamp}`,
      status: mapStatus(result.status, result.ok),
      timestamp,
    };
  }

  async sendBatch(payloads: SendMessagePayload[]): Promise<SendMessageResult[]> {
    const out: SendMessageResult[] = [];
    for (const p of payloads) {
      out.push(await this.sendMessage(p));
    }
    return out;
  }
}
