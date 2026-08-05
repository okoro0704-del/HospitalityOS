import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  DINING_AREA_TYPES,
  DINING_ORDER_STATUSES,
  DINING_ORDER_TYPES,
  KITCHEN_TICKET_STATUSES,
  TABLE_STATUSES,
} from "@hospitalityos/shared";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireRestaurantModule } from "./lib/module-gate.js";
import { prisma } from "./db.js";
import { writeAudit } from "./lib/audit.js";
import {
  cancelDiningReservation,
  createDiningArea,
  createDiningReservation,
  createDiningTable,
  createMenuWithCommerceItem,
  createOrder,
  joinTables,
  seatReservation,
  splitTableGroup,
  transitionOrder,
  updateDiningReservation,
  updateKitchenTicket,
  updateTableStatus,
} from "./services/restaurant.js";
import { joinWaitlist } from "./services/booking-engine.js";

async function staffPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireRestaurantModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireRestaurantModule(req, reply);
  };
}

async function guestPre() {
  return async (req: Parameters<typeof requireGuest>[0], reply: Parameters<typeof requireGuest>[1]) => {
    await requireGuest(req, reply);
    if (reply.sent) return;
    await requireRestaurantModule(req, reply);
  };
}

export async function registerRestaurantRoutes(app: FastifyInstance) {
  const staffAny = await staffPre();
  const staffManage = await staffPre([
    "owner",
    "admin",
    "manager",
    "front_desk",
    "operations",
  ]);
  const staffAdmin = await staffPre(["owner", "admin", "manager"]);
  const guest = await guestPre();

  // Dashboard summary
  app.get("/dining/dashboard", { preHandler: staffAny }, async (req) => {
    const tenantId = req.tenantId!;
    const [tables, reservations, orders, tickets] = await Promise.all([
      prisma.diningTable.groupBy({ by: ["status"], where: { tenantId }, _count: true }),
      prisma.diningReservation.count({
        where: {
          tenantId,
          status: { in: ["pending", "confirmed"] },
          seatingAt: { gte: new Date() },
        },
      }),
      prisma.diningOrder.count({
        where: { tenantId, status: { in: ["submitted", "preparing", "ready"] } },
      }),
      prisma.kitchenTicket.count({
        where: { tenantId, status: { in: ["queued", "preparing"] } },
      }),
    ]);
    return {
      tables,
      upcomingReservations: reservations,
      openOrders: orders,
      kitchenQueue: tickets,
    };
  });

  // Areas
  app.get("/dining/areas", { preHandler: staffAny }, async (req) => {
    const areas = await prisma.diningArea.findMany({
      where: { tenantId: req.tenantId! },
      include: { _count: { select: { tables: true } } },
      orderBy: { name: "asc" },
    });
    return { areas };
  });

  app.post("/dining/areas", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        areaType: z.enum(DINING_AREA_TYPES).optional(),
        description: z.string().optional(),
      })
      .parse(req.body);
    const area = await createDiningArea({
      tenantId: req.tenantId!,
      ...body,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
    });
    return { area };
  });

  // Tables
  app.get("/dining/tables", { preHandler: staffAny }, async (req) => {
    const q = req.query as { diningAreaId?: string; status?: string };
    const tables = await prisma.diningTable.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.diningAreaId ? { diningAreaId: q.diningAreaId } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      include: { diningArea: true, tableGroup: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { tables };
  });

  app.post("/dining/tables", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        diningAreaId: z.string(),
        name: z.string().min(1),
        code: z.string().min(1),
        capacity: z.number().int().positive().optional(),
        minCapacity: z.number().int().positive().optional(),
        isOutdoor: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const table = await createDiningTable({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { table };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.patch("/dining/tables/:id/status", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(TABLE_STATUSES) }).parse(req.body);
    try {
      const table = await updateTableStatus({
        tenantId: req.tenantId!,
        tableId: id,
        status: body.status,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { table };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/dining/table-groups/join", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        tableIds: z.array(z.string()).min(2),
        name: z.string().min(1),
        code: z.string().min(1),
      })
      .parse(req.body);
    try {
      const group = await joinTables({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { group };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/dining/table-groups/:id/split", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const group = await splitTableGroup({
        tenantId: req.tenantId!,
        tableGroupId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { group };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Menus
  app.get("/dining/menus", { preHandler: staffAny }, async (req) => {
    const menus = await prisma.diningMenu.findMany({
      where: { tenantId: req.tenantId! },
      include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
    return { menus };
  });

  app.post("/dining/menus", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        diningAreaId: z.string().optional(),
        seasonal: z.boolean().optional(),
        featured: z.boolean().optional(),
      })
      .parse(req.body);
    const menu = await prisma.diningMenu.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        diningAreaId: body.diningAreaId,
        seasonal: body.seasonal ?? false,
        featured: body.featured ?? false,
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "dining_menu.created",
      resource: "dining_menu",
      resourceId: menu.id,
    });
    return { menu };
  });

  app.post("/dining/menus/:menuId/sections", { preHandler: staffAdmin }, async (req, reply) => {
    const { menuId } = req.params as { menuId: string };
    const menu = await prisma.diningMenu.findFirst({
      where: { id: menuId, tenantId: req.tenantId! },
    });
    if (!menu) return tenantNotFound(reply);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const section = await prisma.menuSection.create({
      data: {
        tenantId: req.tenantId!,
        menuId,
        name: body.name,
        code: body.code,
        description: body.description,
        sortOrder: body.sortOrder ?? 0,
        status: "active",
      },
    });
    return { section };
  });

  app.post("/dining/sections/:sectionId/items", { preHandler: staffAdmin }, async (req, reply) => {
    const { sectionId } = req.params as { sectionId: string };
    const section = await prisma.menuSection.findFirst({
      where: { id: sectionId, tenantId: req.tenantId! },
    });
    if (!section) return tenantNotFound(reply);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        price: z.number().nonnegative(),
        description: z.string().optional(),
        kitchenStationId: z.string().optional(),
        featured: z.boolean().optional(),
        asProduct: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const item = await createMenuWithCommerceItem({
        tenantId: req.tenantId!,
        menuId: section.menuId,
        sectionId,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { item };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Stations
  app.get("/dining/stations", { preHandler: staffAny }, async (req) => {
    const stations = await prisma.kitchenStation.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { stations };
  });

  app.post("/dining/stations", { preHandler: staffAdmin }, async (req) => {
    const body = z.object({ name: z.string().min(1), code: z.string().min(1) }).parse(req.body);
    const station = await prisma.kitchenStation.create({
      data: { tenantId: req.tenantId!, name: body.name, code: body.code, status: "active" },
    });
    return { station };
  });

  // Reservations
  app.get("/dining/reservations", { preHandler: staffAny }, async (req) => {
    const reservations = await prisma.diningReservation.findMany({
      where: { tenantId: req.tenantId! },
      include: { table: true },
      orderBy: { seatingAt: "asc" },
    });
    return { reservations };
  });

  app.post("/dining/reservations", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        diningAreaId: z.string().optional(),
        tableId: z.string().optional(),
        customerId: z.string().optional(),
        partySize: z.number().int().positive(),
        seatingAt: z.string(),
        endsAt: z.string().optional(),
        notes: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const reservation = await createDiningReservation({
        tenantId: req.tenantId!,
        diningAreaId: body.diningAreaId,
        tableId: body.tableId,
        customerId: body.customerId,
        partySize: body.partySize,
        seatingAt: new Date(body.seatingAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        notes: body.notes,
        joinWaitlistIfUnavailable: body.joinWaitlistIfUnavailable,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.patch("/dining/reservations/:id", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        seatingAt: z.string().optional(),
        endsAt: z.string().optional(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().nullable().optional(),
        tableId: z.string().nullable().optional(),
      })
      .parse(req.body);
    try {
      const reservation = await updateDiningReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        seatingAt: body.seatingAt ? new Date(body.seatingAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        partySize: body.partySize,
        notes: body.notes,
        tableId: body.tableId,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/dining/reservations/:id/cancel", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const reservation = await cancelDiningReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/dining/reservations/:id/seat", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ tableId: z.string().optional() }).parse(req.body ?? {});
    try {
      const session = await seatReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        tableId: body.tableId,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { session };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Sessions
  app.get("/dining/sessions", { preHandler: staffAny }, async (req) => {
    const sessions = await prisma.diningSession.findMany({
      where: { tenantId: req.tenantId! },
      include: { table: true, orders: true },
      orderBy: { openedAt: "desc" },
      take: 50,
    });
    return { sessions };
  });

  // Orders
  app.get("/dining/orders", { preHandler: staffAny }, async (req) => {
    const orders = await prisma.diningOrder.findMany({
      where: { tenantId: req.tenantId! },
      include: { items: true, tickets: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { orders };
  });

  app.post("/dining/orders", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        sessionId: z.string().optional(),
        reservationId: z.string().optional(),
        customerId: z.string().optional(),
        orderType: z.enum(DINING_ORDER_TYPES).optional(),
        notes: z.string().optional(),
        items: z
          .array(
            z.object({
              menuItemId: z.string().optional(),
              name: z.string().min(1),
              quantity: z.number().int().positive(),
              unitPrice: z.number().nonnegative(),
              course: z.string().optional(),
              notes: z.string().optional(),
            }),
          )
          .min(1),
      })
      .parse(req.body);
    try {
      const order = await createOrder({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { order };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/dining/orders/:id/transition", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(DINING_ORDER_STATUSES) }).parse(req.body);
    try {
      const order = await transitionOrder({
        tenantId: req.tenantId!,
        orderId: id,
        status: body.status,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { order };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Kitchen
  app.get("/dining/kitchen/tickets", { preHandler: staffAny }, async (req) => {
    const tickets = await prisma.kitchenTicket.findMany({
      where: { tenantId: req.tenantId! },
      include: { order: { include: { items: true } }, station: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
    return { tickets };
  });

  app.patch("/dining/kitchen/tickets/:id", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum(KITCHEN_TICKET_STATUSES),
        priority: z.number().int().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(req.body);
    try {
      const ticket = await updateKitchenTicket({
        tenantId: req.tenantId!,
        ticketId: id,
        status: body.status,
        priority: body.priority,
        notes: body.notes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { ticket };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Shifts
  app.get("/dining/shifts", { preHandler: staffAny }, async (req) => {
    const shifts = await prisma.diningShift.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { startsAt: "desc" },
    });
    return { shifts };
  });

  app.post("/dining/shifts", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        startsAt: z.string(),
        endsAt: z.string(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const shift = await prisma.diningShift.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        notes: body.notes,
        status: "scheduled",
      },
    });
    return { shift };
  });

  // ── Guest ────────────────────────────────────────────────────
  app.get("/guest/dining/menus", { preHandler: guest }, async (req) => {
    const menus = await prisma.diningMenu.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
      include: {
        sections: {
          where: { status: "active" },
          include: { items: { where: { status: "active", available: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ featured: "desc" }, { name: "asc" }],
    });
    return { menus };
  });

  app.get("/guest/dining/offers", { preHandler: guest }, async (req) => {
    const featured = await prisma.menuItem.findMany({
      where: { tenantId: req.tenantId!, featured: true, available: true, status: "active" },
      take: 20,
    });
    return { featured };
  });

  app.get("/guest/dining/reservations", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const reservations = await prisma.diningReservation.findMany({
      where: { tenantId: req.tenantId!, customerId: auth.customerId },
      include: { table: true },
      orderBy: { seatingAt: "desc" },
    });
    return { reservations };
  });

  app.post("/guest/dining/reservations", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        diningAreaId: z.string().optional(),
        tableId: z.string().optional(),
        partySize: z.number().int().positive(),
        seatingAt: z.string(),
        endsAt: z.string().optional(),
        notes: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const reservation = await createDiningReservation({
        tenantId: req.tenantId!,
        diningAreaId: body.diningAreaId,
        tableId: body.tableId,
        customerId: auth.customerId,
        partySize: body.partySize,
        seatingAt: new Date(body.seatingAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        notes: body.notes,
        joinWaitlistIfUnavailable: body.joinWaitlistIfUnavailable ?? true,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { reservation };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.post("/guest/dining/reservations/:id/cancel", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const existing = await prisma.diningReservation.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: auth.customerId },
    });
    if (!existing) return tenantNotFound(reply);
    try {
      const reservation = await cancelDiningReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { reservation };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/guest/dining/waitlist", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const entry = await joinWaitlist({
        tenantId: req.tenantId!,
        moduleId: "restaurant",
        customerId: auth.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        notes: body.notes,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { entry };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/guest/dining/areas", { preHandler: guest }, async (req) => {
    const areas = await prisma.diningArea.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
      orderBy: { name: "asc" },
    });
    return { areas };
  });
}
