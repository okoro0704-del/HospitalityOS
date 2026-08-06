import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ALLOWED_TEMPLATE_VARIABLES } from "@hospitalityos/shared";
import { prisma } from "../../db.js";

const ALLOWED = new Set<string>(ALLOWED_TEMPLATE_VARIABLES as readonly string[]);

/** Safe Mustache-like {{var}} substitution — no executable content. */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    if (!ALLOWED.has(key) && !key.startsWith("custom.")) {
      return "";
    }
    const parts = key.split(".");
    let cur: unknown = variables;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return "";
      }
    }
    if (cur == null) return "";
    const text = String(cur);
    return sanitizeVariable(text);
  });
}

export function sanitizeVariable(value: string) {
  return value
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .slice(0, 500);
}

export function flattenVariables(vars: Record<string, unknown>): Record<string, unknown> {
  return vars;
}

export async function createTemplate(opts: {
  tenantId: string;
  code: string;
  name: string;
  category: string;
  channel: string;
  type: string;
  subject?: string | null;
  body: string;
  variables?: string[];
}) {
  const latest = await prisma.notificationTemplate.findFirst({
    where: { tenantId: opts.tenantId, code: opts.code },
    orderBy: { version: "desc" },
  });
  return prisma.notificationTemplate.create({
    data: {
      tenantId: opts.tenantId,
      code: opts.code,
      name: opts.name,
      category: opts.category,
      channel: opts.channel,
      type: opts.type,
      subject: opts.subject ?? null,
      body: opts.body,
      variables: (opts.variables ?? []) as Prisma.InputJsonValue,
      version: (latest?.version ?? 0) + 1,
      status: "active",
    },
  });
}

export function buildIdempotencyKey(parts: {
  tenantId: string;
  eventType: string;
  sourceEntityId?: string | null;
  recipientKind: string;
  recipientId: string;
  ruleId: string;
  channel: string;
}) {
  const raw = [
    parts.tenantId,
    parts.eventType,
    parts.sourceEntityId ?? "",
    parts.recipientKind,
    parts.recipientId,
    parts.ruleId,
    parts.channel,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 48);
}
