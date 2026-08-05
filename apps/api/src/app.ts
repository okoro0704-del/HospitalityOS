import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";
import { config } from "./config.js";
import { registerRoutes } from "./routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(cookie);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Request validation failed",
        details: err.flatten(),
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = (err as { code?: string }).code ?? "internal_error";
    if (status >= 500) {
      app.log.error(err);
    }
    return reply.code(status).send({
      error: code,
      message: status >= 500 ? "Internal server error" : (err as Error).message,
    });
  });

  await registerRoutes(app);
  return app;
}
