/**
 * Shared HTTP error mapping — always include requestId when available.
 * Prefer throwing errors so Fastify's setErrorHandler can respond;
 * use mapHttpError when a route already catches and sends manually.
 */
export function mapHttpError(err: unknown, requestId?: string) {
  const e = err as { statusCode?: number; code?: string; message?: string };
  let status = e.statusCode ?? 500;
  let code = e.code ?? "internal_error";
  if (typeof code === "string" && (code.startsWith("P") || code.includes("Prisma"))) {
    code = "internal_error";
  }
  // Normalize common aliases
  const aliases: Record<string, string> = {
    unauthorized: "unauthorized",
    forbidden: "forbidden",
    not_found: "not_found",
    validation_error: "validation_error",
    conflict: "conflict",
    module_disabled: "module_disabled",
    capacity_exceeded: "capacity_exceeded",
    sold_out: "capacity_exceeded",
    seat_taken: "capacity_exceeded",
    seat_unavailable: "capacity_exceeded",
    rate_limited: "rate_limited",
    invalid_state: "conflict",
  };
  if (aliases[code]) code = aliases[code];

  const message =
    status >= 500 ? "Internal server error" : (e.message ?? "Unexpected error");

  return {
    status,
    body: {
      error: code,
      message,
      ...(requestId ? { requestId } : {}),
    },
  };
}
