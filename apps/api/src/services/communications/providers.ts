import { config } from "../../config.js";

export type OutboundMessage = {
  tenantId: string;
  to: string;
  subject?: string | null;
  body: string;
  replyTo?: string | null;
  metadata?: Record<string, unknown>;
  /** Idempotency key for provider-side dedupe when supported. */
  idempotencyKey?: string;
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

/** Development / test — never delivers externally. */
export class MockEmailProvider implements NotificationProvider {
  channel = "email";
  async send(message: OutboundMessage): Promise<ProviderResult> {
    if (!message.to) {
      return { ok: false, provider: "email_mock", status: "failed", error: "missing_recipient" };
    }
    return {
      ok: true,
      provider: "email_mock",
      status: "sent",
      externalId: `mock_email_${message.idempotencyKey ?? Date.now()}`,
    };
  }
}

/** Logs subject + recipient hash only — no body/secrets. */
export class ConsoleEmailProvider implements NotificationProvider {
  channel = "email";
  async send(message: OutboundMessage): Promise<ProviderResult> {
    if (!message.to) {
      return { ok: false, provider: "email_console", status: "failed", error: "missing_recipient" };
    }
    const toHint = message.to.includes("@")
      ? `${message.to.slice(0, 2)}…@${message.to.split("@")[1]}`
      : "redacted";
    console.info("[email:console]", {
      to: toHint,
      subject: message.subject ?? "(none)",
      tenantId: message.tenantId,
      idempotencyKey: message.idempotencyKey ?? null,
    });
    return {
      ok: true,
      provider: "email_console",
      status: "sent",
      externalId: `console_email_${message.idempotencyKey ?? Date.now()}`,
    };
  }
}

const SMTP_TIMEOUT_MS = 15_000;
const SMTP_MAX_ATTEMPTS = 3;

/**
 * Production SMTP adapter via raw SMTP URL (smtp://user:pass@host:port).
 * Retries with backoff; never logs credentials or message body.
 */
export class SmtpEmailProvider implements NotificationProvider {
  channel = "email";

  constructor(
    private readonly smtpUrl: string,
    private readonly from: string,
  ) {}

  async send(message: OutboundMessage): Promise<ProviderResult> {
    if (!message.to) {
      return { ok: false, provider: "email_smtp", status: "failed", error: "missing_recipient" };
    }
    if (!this.smtpUrl) {
      return { ok: false, provider: "email_smtp", status: "failed", error: "smtp_not_configured" };
    }

    let lastError = "smtp_failed";
    for (let attempt = 1; attempt <= SMTP_MAX_ATTEMPTS; attempt++) {
      try {
        const externalId = await sendSmtpMail({
          smtpUrl: this.smtpUrl,
          from: this.from,
          to: message.to,
          subject: message.subject ?? "HospitalityOS",
          body: message.body,
          replyTo: message.replyTo ?? undefined,
          idempotencyKey: message.idempotencyKey,
          timeoutMs: SMTP_TIMEOUT_MS,
        });
        return {
          ok: true,
          provider: "email_smtp",
          status: "sent",
          externalId,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message.slice(0, 200) : "smtp_failed";
        if (attempt < SMTP_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    }
    return { ok: false, provider: "email_smtp", status: "failed", error: lastError };
  }
}

/** Minimal SMTP client (AUTH LOGIN) without pulling a heavy dependency. */
async function sendSmtpMail(opts: {
  smtpUrl: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  idempotencyKey?: string;
  timeoutMs: number;
}): Promise<string> {
  const url = new URL(opts.smtpUrl);
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
    throw new Error("unsupported_smtp_scheme");
  }
  const useTls = url.protocol === "smtps:";
  const port = Number(url.port || (useTls ? 465 : 587));
  const host = url.hostname;
  const user = decodeURIComponent(url.username || "");
  const pass = decodeURIComponent(url.password || "");

  const net = await import("node:net");
  const tls = await import("node:tls");

  const socket = useTls
    ? tls.connect({ host, port, servername: host, timeout: opts.timeoutMs })
    : net.createConnection({ host, port, timeout: opts.timeoutMs });

  const readLine = (): Promise<string> =>
    new Promise((resolve, reject) => {
      let buf = "";
      const onData = (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        const idx = buf.indexOf("\r\n");
        if (idx >= 0) {
          socket.off("data", onData);
          socket.off("error", onErr);
          resolve(buf.slice(0, idx));
        }
      };
      const onErr = (e: Error) => reject(e);
      socket.on("data", onData);
      socket.on("error", onErr);
    });

  const write = async (cmd: string) => {
    socket.write(cmd.endsWith("\r\n") ? cmd : `${cmd}\r\n`);
  };

  const expect = async (prefix: string) => {
    const line = await readLine();
    if (!line.startsWith(prefix)) throw new Error(`smtp_unexpected:${line.slice(0, 40)}`);
    return line;
  };

  try {
    await expect("220");
    await write(`EHLO hospitalityos.local`);
    // Consume multi-line EHLO
    let line = await readLine();
    while (line.startsWith("250-")) line = await readLine();
    if (!line.startsWith("250")) throw new Error("smtp_ehlo_failed");

    if (!useTls && port === 587) {
      await write("STARTTLS");
      await expect("220");
      const upgraded = tls.connect({
        socket: socket as import("node:net").Socket,
        servername: host,
        timeout: opts.timeoutMs,
      });
      Object.assign(socket, upgraded);
    }

    if (user) {
      await write("AUTH LOGIN");
      await expect("334");
      await write(Buffer.from(user).toString("base64"));
      await expect("334");
      await write(Buffer.from(pass).toString("base64"));
      await expect("235");
    }

    await write(`MAIL FROM:<${opts.from}>`);
    await expect("250");
    await write(`RCPT TO:<${opts.to}>`);
    await expect("250");
    await write("DATA");
    await expect("354");
    const msgId = opts.idempotencyKey
      ? `<${opts.idempotencyKey.replace(/[^a-zA-Z0-9._-]/g, "")}@hospitalityos.local>`
      : `<${Date.now()}.${Math.random().toString(36).slice(2)}@hospitalityos.local>`;
    const headers = [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
      `Subject: ${opts.subject}`,
      `Message-ID: ${msgId}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "",
      opts.body.replace(/\r?\n\./g, "\r\n.."),
      ".",
    ].join("\r\n");
    await write(headers);
    await expect("250");
    await write("QUIT");
    socket.end();
    return msgId;
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

export class EmailProvider implements NotificationProvider {
  channel = "email";
  private readonly inner: NotificationProvider;

  constructor() {
    const mode = (config.emailProvider || "mock").toLowerCase();
    if (mode === "smtp") {
      this.inner = new SmtpEmailProvider(config.smtpUrl, config.smtpFrom);
    } else if (mode === "console") {
      this.inner = new ConsoleEmailProvider();
    } else {
      this.inner = new MockEmailProvider();
    }
  }

  send(message: OutboundMessage): Promise<ProviderResult> {
    return this.inner.send(message);
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
