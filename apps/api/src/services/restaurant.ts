import type { Prisma } from "@prisma/client";
import type { DiningOrderStatus, TableStatus } from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import {
  cancelBooking,
  createBooking,
  ensureDefaultCategories,
  joinWaitlist,
  transitionBooking,
  updateBooking,
} from "./booking-engine.js";
import { createOffering, ensureDefaultCatalog } from "./commerce-engine.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

function confCode() {
  return `DN-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

async function ensureDiningCategory(tenantId: string) {
  await ensureDefaultCategories(tenantId);
  return prisma.resourceCategory.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "dining" } },
  });
}

export async function syncTableToBookableResource(opts: {
  tenantId: string;
  tableId: string;
  name: string;
  code: string;
  capacity: number;
  status: string;
}) {
  const category = await ensureDiningCategory(opts.tenantId);
  const resourceStatus =
    opts.status === "out_of_service"
      ? "unavailable"
      : opts.status === "cleaning"
        ? "maintenance"
        : "available";

  return prisma.bookableResource.upsert({
    where: {
      tenantId_sourceType_sourceId: {
        tenantId: opts.tenantId,
        sourceType: "dining_table",
        sourceId: opts.tableId,
      },
    },
    create: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "restaurant",
      name: opts.name,
      code: `TBL-${opts.code}`,
      capacity: opts.capacity,
      status: resourceStatus,
      tags: ["table", "dining"],
      metadata: { diningTableId: opts.tableId },
      customFields: {},
      sourceType: "dining_table",
      sourceId: opts.tableId,
    },
    update: {
      name: opts.name,
      capacity: opts.capacity,
      status: resourceStatus,
    },
  });
}

export async function createDiningArea(opts: {
  tenantId: string;
  name: string;
  code: string;
  areaType?: string;
  description?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const area = await prisma.diningArea.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name,
      code: opts.code,
      areaType: opts.areaType ?? "indoor",
      description: opts.description ?? null,
      metadata: {},
      status: "active",
    },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_area.created",
    resource: "dining_area",
    resourceId: area.id,
  });
  return area;
}

export async function createDiningTable(opts: {
  tenantId: string;
  diningAreaId: string;
  name: string;
  code: string;
  capacity?: number;
  minCapacity?: number;
  isOutdoor?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  const area = await prisma.diningArea.findFirst({
    where: { id: opts.diningAreaId, tenantId: opts.tenantId },
  });
  if (!area) throw httpError("Dining area not found", "not_found", 404);

  const table = await prisma.diningTable.create({
    data: {
      tenantId: opts.tenantId,
      diningAreaId: opts.diningAreaId,
      name: opts.name,
      code: opts.code,
      capacity: opts.capacity ?? 2,
      minCapacity: opts.minCapacity ?? 1,
      isOutdoor: opts.isOutdoor ?? false,
      status: "available",
      metadata: {},
    },
  });

  const resource = await syncTableToBookableResource({
    tenantId: opts.tenantId,
    tableId: table.id,
    name: table.name,
    code: table.code,
    capacity: table.capacity,
    status: table.status,
  });

  const updated = await prisma.diningTable.update({
    where: { id: table.id },
    data: { bookableResourceId: resource.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_table.created",
    resource: "dining_table",
    resourceId: table.id,
    metadata: { bookableResourceId: resource.id },
  });

  return updated;
}

export async function updateTableStatus(opts: {
  tenantId: string;
  tableId: string;
  status: TableStatus;
  actorKind: string;
  actorId?: string | null;
}) {
  const table = await prisma.diningTable.findFirst({
    where: { id: opts.tableId, tenantId: opts.tenantId },
  });
  if (!table) throw httpError("Table not found", "not_found", 404);

  const updated = await prisma.diningTable.update({
    where: { id: table.id },
    data: { status: opts.status },
  });

  if (table.bookableResourceId) {
    await syncTableToBookableResource({
      tenantId: opts.tenantId,
      tableId: table.id,
      name: table.name,
      code: table.code,
      capacity: table.capacity,
      status: opts.status,
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_table.status",
    resource: "dining_table",
    resourceId: table.id,
    metadata: { status: opts.status },
  });

  return updated;
}

export async function joinTables(opts: {
  tenantId: string;
  tableIds: string[];
  name: string;
  code: string;
  actorKind: string;
  actorId?: string | null;
}) {
  if (opts.tableIds.length < 2) {
    throw httpError("At least two tables required", "validation_error", 400);
  }
  const tables = await prisma.diningTable.findMany({
    where: { tenantId: opts.tenantId, id: { in: opts.tableIds } },
  });
  if (tables.length !== opts.tableIds.length) {
    throw httpError("One or more tables not found", "not_found", 404);
  }
  const capacity = tables.reduce((s, t) => s + t.capacity, 0);
  const group = await prisma.tableGroup.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name,
      code: opts.code,
      capacity,
      status: "active",
    },
  });
  await prisma.diningTable.updateMany({
    where: { id: { in: opts.tableIds }, tenantId: opts.tenantId },
    data: { tableGroupId: group.id },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "table_group.joined",
    resource: "table_group",
    resourceId: group.id,
    metadata: { tableIds: opts.tableIds },
  });
  return group;
}

export async function splitTableGroup(opts: {
  tenantId: string;
  tableGroupId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const group = await prisma.tableGroup.findFirst({
    where: { id: opts.tableGroupId, tenantId: opts.tenantId },
  });
  if (!group) throw httpError("Table group not found", "not_found", 404);
  await prisma.diningTable.updateMany({
    where: { tableGroupId: group.id, tenantId: opts.tenantId },
    data: { tableGroupId: null },
  });
  await prisma.tableGroup.update({
    where: { id: group.id },
    data: { status: "split" },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "table_group.split",
    resource: "table_group",
    resourceId: group.id,
  });
  return group;
}

export async function createDiningReservation(opts: {
  tenantId: string;
  diningAreaId?: string | null;
  tableId?: string | null;
  customerId?: string | null;
  partySize: number;
  seatingAt: Date;
  endsAt?: Date | null;
  notes?: string | null;
  status?: string;
  joinWaitlistIfUnavailable?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  let table = opts.tableId
    ? await prisma.diningTable.findFirst({
        where: { id: opts.tableId, tenantId: opts.tenantId },
      })
    : null;

  if (table && ["out_of_service", "cleaning"].includes(table.status)) {
    throw httpError("Table is not reservable", "table_unavailable", 409);
  }

  if (!table && opts.diningAreaId) {
    const candidates = await prisma.diningTable.findMany({
      where: {
        tenantId: opts.tenantId,
        diningAreaId: opts.diningAreaId,
        status: { in: ["available", "reserved"] },
        capacity: { gte: opts.partySize },
      },
      orderBy: { capacity: "asc" },
    });
    table = candidates[0] ?? null;
  }

  const endsAt =
    opts.endsAt ?? new Date(opts.seatingAt.getTime() + 90 * 60 * 1000);

  let bookingId: string | null = null;
  if (table?.bookableResourceId) {
    try {
      const booking = await createBooking({
        tenantId: opts.tenantId,
        moduleId: "restaurant",
        customerId: opts.customerId,
        startsAt: opts.seatingAt,
        endsAt,
        partySize: opts.partySize,
        notes: opts.notes,
        status: opts.status === "pending" ? "pending" : "confirmed",
        items: [{ resourceId: table.bookableResourceId, quantity: 1 }],
        actorKind: opts.actorKind,
        actorId: opts.actorId,
        allowWaitlistFallback: opts.joinWaitlistIfUnavailable ?? false,
      });
      bookingId = booking.id;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      if (e.code === "waitlisted") throw e;
      if (opts.joinWaitlistIfUnavailable && opts.customerId && table.bookableResourceId) {
        const entry = await joinWaitlist({
          tenantId: opts.tenantId,
          moduleId: "restaurant",
          customerId: opts.customerId,
          resourceId: table.bookableResourceId,
          startsAt: opts.seatingAt,
          endsAt,
          partySize: opts.partySize,
          actorKind: opts.actorKind,
          actorId: opts.actorId,
        });
        throw Object.assign(new Error("No table available — added to waitlist"), {
          code: "waitlisted",
          statusCode: 409,
          waitlistEntry: entry,
        });
      }
      throw e;
    }
  } else if (opts.joinWaitlistIfUnavailable && opts.customerId) {
    const entry = await joinWaitlist({
      tenantId: opts.tenantId,
      moduleId: "restaurant",
      customerId: opts.customerId,
      startsAt: opts.seatingAt,
      endsAt,
      partySize: opts.partySize,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    });
    throw Object.assign(new Error("No table available — added to waitlist"), {
      code: "waitlisted",
      statusCode: 409,
      waitlistEntry: entry,
    });
  }

  const reservation = await prisma.diningReservation.create({
    data: {
      tenantId: opts.tenantId,
      diningAreaId: opts.diningAreaId ?? table?.diningAreaId ?? null,
      tableId: table?.id ?? null,
      customerId: opts.customerId ?? null,
      bookingId,
      status: opts.status ?? "confirmed",
      partySize: opts.partySize,
      seatingAt: opts.seatingAt,
      endsAt,
      notes: opts.notes ?? null,
      confirmationCode: confCode(),
    },
    include: { table: true },
  });

  if (table) {
    await prisma.diningTable.update({
      where: { id: table.id },
      data: { status: "reserved" },
    });
  }

  if (opts.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: opts.customerId,
      title: "Reservation confirmed",
      body: `Dining reservation ${reservation.confirmationCode} confirmed.`,
      metadata: { reservationId: reservation.id },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_reservation.created",
    resource: "dining_reservation",
    resourceId: reservation.id,
    metadata: { bookingId },
  });

  return reservation;
}

export async function cancelDiningReservation(opts: {
  tenantId: string;
  reservationId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.diningReservation.findFirst({
    where: { id: opts.reservationId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (["cancelled", "completed", "seated"].includes(existing.status)) {
    throw httpError("Reservation cannot be cancelled", "invalid_state", 409);
  }

  const updated = await prisma.diningReservation.update({
    where: { id: existing.id },
    data: { status: "cancelled", cancelledAt: new Date() },
    include: { table: true },
  });

  if (existing.bookingId) {
    await cancelBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  if (existing.tableId) {
    await prisma.diningTable.update({
      where: { id: existing.tableId },
      data: { status: "available" },
    });
  }

  if (existing.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Reservation cancelled",
      body: `Dining reservation ${existing.confirmationCode} was cancelled.`,
      metadata: { reservationId: existing.id },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_reservation.cancelled",
    resource: "dining_reservation",
    resourceId: existing.id,
  });

  return updated;
}

export async function updateDiningReservation(opts: {
  tenantId: string;
  reservationId: string;
  seatingAt?: Date;
  endsAt?: Date;
  partySize?: number;
  notes?: string | null;
  tableId?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.diningReservation.findFirst({
    where: { id: opts.reservationId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  if (["cancelled", "completed"].includes(existing.status)) {
    throw httpError("Reservation cannot be modified", "invalid_state", 409);
  }

  if (existing.bookingId && (opts.seatingAt || opts.endsAt || opts.partySize)) {
    await updateBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      startsAt: opts.seatingAt,
      endsAt: opts.endsAt,
      partySize: opts.partySize,
      notes: opts.notes,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    });
  }

  const updated = await prisma.diningReservation.update({
    where: { id: existing.id },
    data: {
      seatingAt: opts.seatingAt,
      endsAt: opts.endsAt,
      partySize: opts.partySize,
      notes: opts.notes,
      tableId: opts.tableId === undefined ? undefined : opts.tableId,
    },
    include: { table: true },
  });

  if (existing.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Reservation updated",
      body: `Dining reservation ${existing.confirmationCode} was updated.`,
      metadata: { reservationId: existing.id },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_reservation.updated",
    resource: "dining_reservation",
    resourceId: existing.id,
  });

  return updated;
}

export async function seatReservation(opts: {
  tenantId: string;
  reservationId: string;
  tableId?: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.diningReservation.findFirst({
    where: { id: opts.reservationId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Reservation not found", "not_found", 404);
  const tableId = opts.tableId ?? existing.tableId;
  if (!tableId) throw httpError("Table required to seat", "validation_error", 400);

  const session = await prisma.diningSession.create({
    data: {
      tenantId: opts.tenantId,
      reservationId: existing.id,
      tableId,
      customerId: existing.customerId,
      partySize: existing.partySize,
      status: "open",
    },
  });

  await prisma.diningReservation.update({
    where: { id: existing.id },
    data: { status: "seated", tableId },
  });
  await prisma.diningTable.update({
    where: { id: tableId },
    data: { status: "occupied" },
  });

  if (existing.bookingId) {
    await transitionBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      status: "checked_in",
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "staff",
    actorId: opts.actorId,
    title: "Table ready / seated",
    body: `Party of ${existing.partySize} seated.`,
    metadata: { reservationId: existing.id, sessionId: session.id },
  });

  return session;
}

export async function createMenuWithCommerceItem(opts: {
  tenantId: string;
  menuId: string;
  sectionId: string;
  name: string;
  code: string;
  price: number;
  description?: string | null;
  kitchenStationId?: string | null;
  featured?: boolean;
  asProduct?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: opts.asProduct === false ? "service" : "product",
    name: opts.name,
    code: `MENU-${opts.code}`,
    description: opts.description,
    basePrice: opts.price,
    status: "active",
    visibility: "public",
    featured: opts.featured,
    moduleId: "restaurant",
    sku: opts.code,
    unit: "each",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const item = await prisma.menuItem.create({
    data: {
      tenantId: opts.tenantId,
      sectionId: opts.sectionId,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      price: opts.price,
      kitchenStationId: opts.kitchenStationId ?? null,
      featured: opts.featured ?? false,
      available: true,
      status: "active",
      metadata: {},
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "menu_item.created",
    resource: "menu_item",
    resourceId: item.id,
    metadata: { offeringId: offering.id },
  });

  return item;
}

export async function createOrder(opts: {
  tenantId: string;
  sessionId?: string | null;
  reservationId?: string | null;
  customerId?: string | null;
  orderType?: string;
  notes?: string | null;
  items: Array<{
    menuItemId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
    course?: string | null;
    notes?: string | null;
    kitchenStationId?: string | null;
  }>;
  actorKind: string;
  actorId?: string | null;
}) {
  if (!opts.items.length) {
    throw httpError("Order requires items", "validation_error", 400);
  }

  const subtotal = opts.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const charge = await prisma.serviceChargeRule.findFirst({
    where: { tenantId: opts.tenantId, status: "active" },
  });
  const serviceCharge = charge
    ? charge.percent > 0
      ? subtotal * (charge.percent / 100)
      : charge.amount
    : 0;
  const total = subtotal + serviceCharge;

  const order = await prisma.diningOrder.create({
    data: {
      tenantId: opts.tenantId,
      sessionId: opts.sessionId ?? null,
      reservationId: opts.reservationId ?? null,
      customerId: opts.customerId ?? null,
      orderType: opts.orderType ?? "dine_in",
      status: "draft",
      notes: opts.notes ?? null,
      subtotal,
      serviceCharge,
      total,
      items: {
        create: opts.items.map((i) => ({
          tenantId: opts.tenantId,
          menuItemId: i.menuItemId ?? null,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          course: i.course ?? null,
          notes: i.notes ?? null,
          status: "pending",
          modifiers: {},
        })),
      },
    },
    include: { items: true },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_order.created",
    resource: "dining_order",
    resourceId: order.id,
  });

  return order;
}

export async function transitionOrder(opts: {
  tenantId: string;
  orderId: string;
  status: DiningOrderStatus;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.diningOrder.findFirst({
    where: { id: opts.orderId, tenantId: opts.tenantId },
    include: { items: true },
  });
  if (!existing) throw httpError("Order not found", "not_found", 404);

  const data: Prisma.DiningOrderUpdateInput = { status: opts.status };
  if (opts.status === "submitted") data.submittedAt = new Date();
  if (opts.status === "completed") data.completedAt = new Date();
  if (opts.status === "cancelled") data.cancelledAt = new Date();

  const updated = await prisma.diningOrder.update({
    where: { id: existing.id },
    data,
    include: { items: true, tickets: true },
  });

  if (opts.status === "submitted") {
    // Fire kitchen tickets by station
    const stationIds = new Set<string>();
    for (const item of existing.items) {
      if (item.menuItemId) {
        const mi = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
        if (mi?.kitchenStationId) stationIds.add(mi.kitchenStationId);
      }
    }
    if (stationIds.size === 0) {
      await prisma.kitchenTicket.create({
        data: {
          tenantId: opts.tenantId,
          orderId: existing.id,
          status: "queued",
          priority: 0,
          notes: existing.notes,
          firedAt: new Date(),
        },
      });
    } else {
      for (const stationId of stationIds) {
        await prisma.kitchenTicket.create({
          data: {
            tenantId: opts.tenantId,
            orderId: existing.id,
            kitchenStationId: stationId,
            status: "queued",
            priority: 0,
            notes: existing.notes,
            firedAt: new Date(),
          },
        });
      }
    }

    if (existing.customerId) {
      await createNotification({
        tenantId: opts.tenantId,
        actorKind: "guest",
        actorId: existing.customerId,
        title: "Order accepted",
        body: "Your order was submitted to the kitchen.",
        metadata: { orderId: existing.id },
      });
    }
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "staff",
      actorId: opts.actorId,
      title: "Kitchen alert",
      body: `New order ticket for order ${existing.id.slice(-6)}`,
      metadata: { orderId: existing.id },
    });
  }

  if (opts.status === "ready" && existing.customerId) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Order ready",
      body: "Your order is ready.",
      metadata: { orderId: existing.id },
    });
  }

  if (opts.status === "preparing") {
    await prisma.kitchenTicket.updateMany({
      where: { orderId: existing.id, tenantId: opts.tenantId, status: "queued" },
      data: { status: "preparing" },
    });
  }
  if (opts.status === "ready") {
    await prisma.kitchenTicket.updateMany({
      where: { orderId: existing.id, tenantId: opts.tenantId },
      data: { status: "ready", readyAt: new Date() },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "dining_order.transition",
    resource: "dining_order",
    resourceId: existing.id,
    metadata: { status: opts.status },
  });

  return updated;
}

export async function updateKitchenTicket(opts: {
  tenantId: string;
  ticketId: string;
  status: string;
  priority?: number;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const ticket = await prisma.kitchenTicket.findFirst({
    where: { id: opts.ticketId, tenantId: opts.tenantId },
  });
  if (!ticket) throw httpError("Ticket not found", "not_found", 404);

  const updated = await prisma.kitchenTicket.update({
    where: { id: ticket.id },
    data: {
      status: opts.status,
      priority: opts.priority,
      notes: opts.notes === undefined ? undefined : opts.notes,
      readyAt: opts.status === "ready" ? new Date() : undefined,
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "kitchen_ticket.updated",
    resource: "kitchen_ticket",
    resourceId: ticket.id,
    metadata: { status: opts.status },
  });

  return updated;
}
