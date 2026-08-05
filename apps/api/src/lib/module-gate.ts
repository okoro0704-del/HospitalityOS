import type { FastifyReply, FastifyRequest } from "fastify";
import { assertModuleEnabled } from "../services/modules.js";

/** Gate accommodation routes — tenants without the module get 404. */
export async function requireAccommodationModule(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "Authentication required",
    });
  }
  const enabled = await assertModuleEnabled(tenantId, "accommodation");
  if (!enabled) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Accommodation module is not enabled for this business",
    });
  }
}

/** Gate restaurant/dining routes. */
export async function requireRestaurantModule(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "Authentication required",
    });
  }
  const enabled = await assertModuleEnabled(tenantId, "restaurant");
  if (!enabled) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Restaurant module is not enabled for this business",
    });
  }
}

/** Gate gym/fitness routes — gym_membership or fitness_classes. */
export async function requireGymModule(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return reply.code(401).send({
      error: "unauthorized",
      message: "Authentication required",
    });
  }
  const gym = await assertModuleEnabled(tenantId, "gym_membership");
  const classes = await assertModuleEnabled(tenantId, "fitness_classes");
  if (!gym && !classes) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Gym / fitness module is not enabled for this business",
    });
  }
}
