export type OutboundMessage = {
  tenantId: string;
  to: string;
  subject?: string | null;
  body: string;
  metadata?: Record<string, unknown>;
};

export type ProviderResult = {
  ok: boolean;
  provider: string;
  status: "sent" | "delivered" | "failed" | "skipped";
  externalId?: string;
  error?: string;
};

export interface NotificationProvider {
  channel: string;
  send(message: OutboundMessage): Promise<ProviderResult>;
}

export class InAppProvider implements NotificationProvider {
  channel = "in_app";
  async send(_message: OutboundMessage): Promise<ProviderResult> {
    // In-app is persisted as Notification row by the engine; adapter is a no-op success.
    return { ok: true, provider: "in_app", status: "delivered" };
  }
}

export class EmailProvider implements NotificationProvider {
  channel = "email";
  async send(message: OutboundMessage): Promise<ProviderResult> {
    if (!message.to) {
      return { ok: false, provider: "email_mock", status: "failed", error: "missing_recipient" };
    }
    // Mock — no external API
    return {
      ok: true,
      provider: "email_mock",
      status: "sent",
      externalId: `mock_email_${Date.now()}`,
    };
  }
}

export class SmsProvider implements NotificationProvider {
  channel = "sms";
  async send(message: OutboundMessage): Promise<ProviderResult> {
    if (!message.to) {
      return { ok: false, provider: "sms_mock", status: "failed", error: "missing_recipient" };
    }
    return {
      ok: true,
      provider: "sms_mock",
      status: "sent",
      externalId: `mock_sms_${Date.now()}`,
    };
  }
}

export class PushProvider implements NotificationProvider {
  channel = "push";
  async send(message: OutboundMessage): Promise<ProviderResult> {
    if (!message.to) {
      return { ok: false, provider: "push_mock", status: "failed", error: "missing_recipient" };
    }
    return {
      ok: true,
      provider: "push_mock",
      status: "sent",
      externalId: `mock_push_${Date.now()}`,
    };
  }
}

/** Interface-only — not registered for delivery in Sprint 12. */
export interface WhatsAppProvider extends NotificationProvider {
  channel: "whatsapp";
}

export function getProvider(channel: string): NotificationProvider | null {
  switch (channel) {
    case "in_app":
      return new InAppProvider();
    case "email":
      return new EmailProvider();
    case "sms":
      return new SmsProvider();
    case "push":
      return new PushProvider();
    case "whatsapp":
      return null;
    default:
      return null;
  }
}
