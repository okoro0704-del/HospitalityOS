import { randomUUID } from "node:crypto";
import type { DispatchJobOptions, IJobDispatcher } from "@hospitalityos/shared";
import { enqueueJob } from "./jobs.js";

/**
 * Local job dispatcher — wraps in-process Prisma-backed background jobs.
 * Optional payload keys: `_tenantId` (string) for tenant scope.
 */
export class LocalJobDispatcherAdapter implements IJobDispatcher {
  async dispatch(options: DispatchJobOptions): Promise<{ jobId: string; status: "DISPATCHED" }> {
    const tenantRaw = options.payload._tenantId;
    const tenantId = typeof tenantRaw === "string" ? tenantRaw : null;

    let runAt: Date | undefined;
    if (options.scheduledAt) {
      runAt = options.scheduledAt;
    } else if (options.delayMs != null && options.delayMs > 0) {
      runAt = new Date(Date.now() + options.delayMs);
    }

    const { _tenantId: _omit, ...rest } = options.payload;
    void _omit;

    const row = await enqueueJob({
      tenantId,
      type: options.jobName,
      payload: rest,
      idempotencyKey: options.deduplicationKey ?? randomUUID(),
      runAt,
    });

    return { jobId: row.id, status: "DISPATCHED" };
  }
}
