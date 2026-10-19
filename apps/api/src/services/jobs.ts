/**
 * Lightweight background job foundation (in-process).
 * Not a distributed queue — suitable for single-node / MVP production.
 * Jobs are idempotent by (tenantId, type, idempotencyKey).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "retrying" | "dead";

export type JobHandler = (job: {
  id: string;
  tenantId: string | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
}) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

/** Persist a job. Duplicate idempotencyKey returns the existing row. */
export async function enqueueJob(opts: {
  tenantId?: string | null;
  type: string;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  runAt?: Date;
  maxAttempts?: number;
}) {
  const existing = await prisma.backgroundJob.findUnique({
    where: {
      tenantId_type_idempotencyKey: {
        tenantId: opts.tenantId ?? "platform",
        type: opts.type,
        idempotencyKey: opts.idempotencyKey,
      },
    },
  });
  if (existing) return existing;

  return prisma.backgroundJob.create({
    data: {
      tenantId: opts.tenantId ?? "platform",
      type: opts.type,
      payload: (opts.payload ?? {}) as Prisma.InputJsonValue,
      idempotencyKey: opts.idempotencyKey,
      status: "pending",
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
      attempts: 0,
      lastError: null,
    },
  });
}

export async function processDueJobs(limit = 20) {
  const now = new Date();
  const due = await prisma.backgroundJob.findMany({
    where: {
      status: { in: ["pending", "failed", "retrying"] },
      runAt: { lte: now },
    },
    orderBy: { runAt: "asc" },
    take: limit,
  });

  const results: Array<{ id: string; status: string }> = [];

  for (const job of due) {
    if (job.attempts >= (job.maxAttempts ?? 5)) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "dead",
          lastError: job.lastError ?? "max_attempts_exceeded",
          completedAt: new Date(),
        },
      });
      results.push({ id: job.id, status: "dead" });
      continue;
    }

    const handler = handlers.get(job.type);
    if (!handler) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "dead",
          lastError: `No handler for type ${job.type}`,
          completedAt: new Date(),
        },
      });
      results.push({ id: job.id, status: "dead" });
      continue;
    }

    const attempts = job.attempts + 1;
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "running", attempts, startedAt: new Date() },
    });

    try {
      await handler({
        id: job.id,
        tenantId: job.tenantId === "platform" ? null : job.tenantId,
        type: job.type,
        payload: (job.payload ?? {}) as Record<string, unknown>,
        attempts,
      });
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "completed", completedAt: new Date(), lastError: null },
      });
      results.push({ id: job.id, status: "completed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "job_failed";
      const dead = attempts >= (job.maxAttempts ?? 5);
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: dead ? "dead" : "retrying",
          lastError: message.slice(0, 500),
          runAt: dead ? job.runAt : new Date(Date.now() + attempts * 30_000),
          completedAt: dead ? new Date() : null,
        },
      });
      results.push({ id: job.id, status: dead ? "dead" : "retrying" });
    }
  }

  return { processed: results.length, results };
}

export async function jobStatusSummary(tenantId?: string) {
  const where = tenantId ? { tenantId } : {};
  const groups = await prisma.backgroundJob.groupBy({
    by: ["status"],
    where,
    _count: true,
  });
  return Object.fromEntries(groups.map((g) => [g.status, g._count]));
}

/** Built-in: release expired cinema seat holds for a tenant (or all). */
export function registerDefaultJobHandlers(deps: {
  releaseExpiredCinemaHolds: (tenantId?: string) => Promise<number>;
  processDueNotificationSchedules?: (tenantId?: string) => Promise<unknown>;
}) {
  registerJobHandler("cinema.release_expired_holds", async (job) => {
    const n = await deps.releaseExpiredCinemaHolds(job.tenantId ?? undefined);
    if (job.tenantId) {
      await writeAudit({
        tenantId: job.tenantId,
        actorKind: "system",
        action: "job.cinema.release_expired_holds",
        resource: "background_job",
        resourceId: job.id,
        metadata: { released: n },
      }).catch(() => undefined);
    }
  });

  registerJobHandler("notifications.process_due", async (job) => {
    if (!deps.processDueNotificationSchedules) return;
    await deps.processDueNotificationSchedules(job.tenantId ?? undefined);
  });
}
