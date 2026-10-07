import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireGuest, requireStaff } from "./lib/auth.js";
import { InfrastructureError } from "./services/pdi/endpoints.js";
import {
  approvePdi,
  connectPdi,
  createPersonalPdi,
  approveCommunication,
  executeCommunication,
  executeCurrentActor,
  pdiSurface,
  requestCommunication,
  pdiTestDiagnostics,
  revokePdi,
  type PdiActor,
  type PdiSurface,
} from "./services/pdi/product.js";

function actorFrom(req: FastifyRequest, kind: "guest" | "staff"): PdiActor {
  const auth = req.auth;
  if (!auth || auth.kind !== kind) throw new InfrastructureError("UNAUTHORIZED", "HospitalityOS session required", 401);
  if (auth.kind === "guest") {
    return { tenantId: auth.tenantId, actorKind: "guest", actorId: auth.customerId, hospitalitySessionId: auth.sessionId };
  }
  if (auth.kind === "staff") {
    return { tenantId: auth.tenantId, actorKind: "staff", actorId: auth.staffId, hospitalitySessionId: auth.sessionId };
  }
  throw new InfrastructureError("UNAUTHORIZED", "HospitalityOS session required", 401);
}

function send(reply: FastifyReply, error: unknown) {
  if (error instanceof InfrastructureError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }
  return reply.code(503).send({ code: "DDI_UNAVAILABLE", message: "Digiconomy infrastructure is unavailable." });
}

function publicView(view: PdiSurface, diagnostics: Record<string, unknown> | null) {
  const execution = view.execution
    ? {
        status: view.execution.status,
        ...(view.execution.reason ? { reason: view.execution.reason } : {}),
        ...(diagnostics && view.execution.ownerId ? { ownerId: view.execution.ownerId } : {}),
      }
    : undefined;
  return { ...view, ...(execution ? { execution } : {}), ...(diagnostics ? { diagnostics } : {}) };
}

async function diagnosticsFor(req: FastifyRequest, actor: PdiActor) {
  if (process.env.NODE_ENV === "production") return null;
  if ((req.query as { diagnostics?: string }).diagnostics !== "1") return null;
  return pdiTestDiagnostics(actor);
}

function registerActorRoutes(app: FastifyInstance, prefix: string, guard: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>, kind: "guest" | "staff") {
  app.get(prefix, { preHandler: guard }, async (req) => {
    const actor = actorFrom(req, kind);
    return publicView(await pdiSurface(actor), await diagnosticsFor(req, actor));
  });

  app.post(prefix, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    try { return publicView(await createPersonalPdi(actor), await diagnosticsFor(req, actor)); }
    catch (error) { return send(reply, error); }
  });

  app.post(`${prefix}/connect`, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    try { return publicView(await connectPdi(actor), await diagnosticsFor(req, actor)); }
    catch (error) { return send(reply, error); }
  });

  app.post(`${prefix}/approve`, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    try { return publicView(await approvePdi(actor), await diagnosticsFor(req, actor)); }
    catch (error) { return send(reply, error); }
  });

  app.post(`${prefix}/communication/request`, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    try { return await requestCommunication(actor); }
    catch (error) { return send(reply, error); }
  });

  app.post(`${prefix}/communication/approve`, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    try { return await approveCommunication(actor); }
    catch (error) { return send(reply, error); }
  });

  app.post(`${prefix}/communication/execute`, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    const mode = (req.body as { executionMode?: string } | undefined)?.executionMode === "SPACE" ? "SPACE" : "APP";
    try { return await executeCommunication(actor, mode); }
    catch (error) { return send(reply, error); }
  });

  app.post(`${prefix}/execute`, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    const mode = (req.body as { executionMode?: string } | undefined)?.executionMode === "SPACE" ? "SPACE" : "APP";
    try { return publicView(await executeCurrentActor(actor, mode), await diagnosticsFor(req, actor)); }
    catch (error) { return send(reply, error); }
  });

  app.post(`${prefix}/revoke`, { preHandler: guard }, async (req, reply) => {
    const actor = actorFrom(req, kind);
    try { return publicView(await revokePdi(actor), await diagnosticsFor(req, actor)); }
    catch (error) { return send(reply, error); }
  });
}

export async function registerPdiRoutes(app: FastifyInstance) {
  registerActorRoutes(app, "/guest/pdi", requireGuest, "guest");
  registerActorRoutes(app, "/staff/pdi", requireStaff, "staff");
}
