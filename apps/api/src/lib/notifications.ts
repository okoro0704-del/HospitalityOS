import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export async function createNotification(opts: {
  tenantId: string;
  actorKind: string;
  actorId?: string | null;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.notification.create({
    data: {
      tenantId: opts.tenantId,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
      title: opts.title,
      body: opts.body,
      metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
