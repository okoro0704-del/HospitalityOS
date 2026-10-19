import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getMessagingProvider } from "@hospitalityos/shared";
import { requirePermission } from "./lib/permissions.js";
import type { StaffAuth } from "./lib/auth.js";
import { writeAudit } from "./lib/audit.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

function redactEmail(to: string): string {
  if (!to.includes("@")) return "redacted";
  const [local, domain] = to.split("@");
  return `${(local ?? "").slice(0, 2)}…@${domain}`;
}

/**
 * Privileged communications admin routes.
 * Never returns SMTP credentials or message bodies in responses.
 */
export async function registerAdminCommunicationsRoutes(app: FastifyInstance) {
  app.post(
    "/admin/communications/email/test",
    { preHandler: [requirePermission("notifications.manage")] },
    async (req, reply) => {
      const body = z
        .object({
          to: z.string().email(),
          subject: z.string().min(1).max(200).optional(),
          replyTo: z.string().email().optional(),
        })
        .parse(req.body);

      const auth = req.auth as StaffAuth;
      const providerName = config.emailProvider;
      const subject = body.subject ?? "HospitalityOS SMTP test";
      const messageBody =
        "HospitalityOS production email verification.\n\nThis message confirms SMTP delivery configuration.\nDo not reply with credentials.";

      const result = await getMessagingProvider().sendMessage({
        recipientId: body.to,
        channel: "EMAIL",
        body: messageBody,
        metadata: {
          purpose: "smtp_test",
          tenantId: auth.tenantId,
          subject,
          replyTo: body.replyTo ?? (config.smtpReplyTo || undefined),
          idempotencyKey: `smtp_test_${auth.tenantId}_${Date.now()}`,
        },
      });
      const ok = result.status !== "FAILED";
      const providerLabel =
        providerName === "smtp"
          ? "email_smtp"
          : providerName === "console"
            ? "email_console"
            : "email_mock";

      const meta = {
        toHint: redactEmail(body.to),
        provider: providerLabel,
        configuredProvider: providerName,
        externalId: result.messageId,
        error: ok ? null : "send_failed",
        ok,
      };

      await prisma.communicationLog.create({
        data: {
          tenantId: auth.tenantId,
          action: "communications.email.test",
          resource: "email_provider",
          resourceId: result.messageId,
          actorKind: "staff",
          actorId: auth.staffId,
          detail: ok ? "smtp_test_ok" : "smtp_test_failed",
          metadata: meta,
        },
      });

      await writeAudit({
        tenantId: auth.tenantId,
        actorKind: "staff",
        actorId: auth.staffId,
        action: "communications.email.test",
        resource: "email_provider",
        resourceId: result.messageId,
        metadata: meta,
      });

      if (!ok) {
        return reply.code(502).send({
          error: "external_service_unavailable",
          message: "Email delivery test failed",
          provider: providerLabel,
          requestId: req.id,
        });
      }

      return {
        ok: true,
        provider: providerLabel,
        externalId: result.messageId,
        toHint: redactEmail(body.to),
        requestId: req.id,
      };
    },
  );
}
