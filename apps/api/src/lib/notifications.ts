import type { Prisma } from "@prisma/client";
import { createInAppNotification } from "../services/communications/engine.js";

/** Backward-compatible helper used by vertical services. */
export async function createNotification(opts: {
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
  return createInAppNotification({
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
}

export type { Prisma };
