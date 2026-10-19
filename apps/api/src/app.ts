import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { config } from "./config.js";
import { registerRoutes } from "./routes.js";
import { registerPdiRoutes } from "./routes-pdi.js";
import { registerLocalPrimitiveProvidersOrRemote } from "./services/register-primitives.js";
import { registerDefaultJobHandlers } from "./services/jobs.js";
import { releaseExpiredHolds } from "./services/cinema.js";
import { processDueSchedules } from "./services/communications/engine.js";

export async function buildApp() {
  // Phase E: local adapters by default; PRIMITIVES_MODE=remote binds LifeOS engines
  registerLocalPrimitiveProvidersOrRemote();

  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      if (typeof incoming === "string" && incoming.trim()) return incoming.trim();
      return randomUUID();
    },
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(cookie);

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    // Correlation ID for multi-step flows (client may supply)
    const corr = req.headers["x-correlation-id"];
    if (typeof corr === "string" && corr.trim()) {
      reply.header("x-correlation-id", corr.trim());
    } else {
      reply.header("x-correlation-id", req.id);
    }
  });

  app.setErrorHandler((err, req, reply) => {
    const requestId = req.id;
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Request validation failed",
        details: err.flatten(),
        requestId,
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    let code = (err as { code?: string }).code ?? "internal_error";
    if (typeof code === "string" && (code.startsWith("P") || code.includes("Prisma"))) {
      code = "internal_error";
    }
    if (status >= 500) {
      app.log.error({ err, requestId }, "request failed");
    }
    return reply.code(status).send({
      error: code,
      message: status >= 500 ? "Internal server error" : (err as Error).message,
      requestId,
    });
  });

  registerDefaultJobHandlers({
    releaseExpiredCinemaHolds: async (tenantId) => releaseExpiredHolds(tenantId),
    processDueNotificationSchedules: async () => processDueSchedules({}),
  });

  await registerRoutes(app);
  await registerPdiRoutes(app);
  return app;
}
