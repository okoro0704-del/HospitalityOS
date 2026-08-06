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

/** Gate spa/wellness routes — spa_services, beauty_appointments, or wellness_packages. */
export async function requireSpaModule(
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
  const spa = await assertModuleEnabled(tenantId, "spa_services");
  const beauty = await assertModuleEnabled(tenantId, "beauty_appointments");
  const wellness = await assertModuleEnabled(tenantId, "wellness_packages");
  if (!spa && !beauty && !wellness) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Spa / wellness module is not enabled for this business",
    });
  }
}

/** Gate events/venues/ticketing — events, ticketing, or venue_booking. */
export async function requireEventsModule(
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
  const events = await assertModuleEnabled(tenantId, "events");
  const ticketing = await assertModuleEnabled(tenantId, "ticketing");
  const venues = await assertModuleEnabled(tenantId, "venue_booking");
  if (!events && !ticketing && !venues) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Events / venues module is not enabled for this business",
    });
  }
}

/** Gate cinema/entertainment routes. */
export async function requireCinemaModule(
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
  const cinema = await assertModuleEnabled(tenantId, "cinema");
  if (!cinema) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Cinema / entertainment module is not enabled for this business",
    });
  }
}

/** Gate operations & inventory routes. */
export async function requireInventoryModule(
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
  const inventory = await assertModuleEnabled(tenantId, "inventory");
  if (!inventory) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Operations / inventory module is not enabled for this business",
    });
  }
}

/** Gate advanced CRM routes — customer_management module. */
export async function requireCrmModule(
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
  const crm = await assertModuleEnabled(tenantId, "customer_management");
  if (!crm) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "CRM / customer management module is not enabled for this business",
    });
  }
}

/** Gate advanced communications routes — notifications module. */
export async function requireNotificationsModule(
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
  const enabled = await assertModuleEnabled(tenantId, "notifications");
  if (!enabled) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Notifications module is not enabled for this business",
    });
  }
}

/** Gate billing routes — billing module. */
export async function requireBillingModule(
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
  const enabled = await assertModuleEnabled(tenantId, "billing");
  if (!enabled) {
    return reply.code(404).send({
      error: "module_disabled",
      message: "Billing module is not enabled for this business",
    });
  }
}
