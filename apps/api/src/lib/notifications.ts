import type { Prisma } from "@prisma/client";
import { notifyDomain } from "../services/domain-notify.js";

/** Backward-compatible helper used by vertical services — routes through IMessagingProvider. */
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
  return notifyDomain(opts);
}

export type { Prisma };
