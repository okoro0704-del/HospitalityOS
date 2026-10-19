/**
 * Domain-facing notify helper.
 * Persists the in-app inbox row (HOS domain state) and delivers via IMessagingProvider.
 */
import { getMessagingProvider } from "@hospitalityos/shared";
import { createInAppNotification } from "./communications/engine.js";

export async function notifyDomain(opts: {
  tenantId: string;
  actorKind: string;
  actorId?: string | null;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  category?: string;
  priority?: string;
  audience?: string;
  sourceModule?: string | null;
  sourceEntityId?: string | null;
  deepLink?: string | null;
}) {
  const meta = (opts.metadata ?? {}) as Record<string, unknown>;
  const row = await createInAppNotification({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    title: opts.title,
    body: opts.body,
    category: opts.category ?? (typeof meta.category === "string" ? meta.category : "system"),
    priority: opts.priority ?? "normal",
    audience: opts.audience,
    sourceModule: opts.sourceModule ?? (typeof meta.sourceModule === "string" ? meta.sourceModule : null),
    sourceEntityId:
      opts.sourceEntityId ?? (typeof meta.sourceEntityId === "string" ? meta.sourceEntityId : null),
    deepLink: opts.deepLink ?? (typeof meta.deepLink === "string" ? meta.deepLink : null),
    metadata: meta,
  });

  await getMessagingProvider().sendMessage({
    recipientId: opts.actorId ?? "broadcast",
    channel: "IN_APP",
    body: opts.body,
    metadata: {
      tenantId: opts.tenantId,
      subject: opts.title,
      notificationId: row.id,
      actorKind: opts.actorKind,
      ...meta,
    },
  });

  return row;
}
