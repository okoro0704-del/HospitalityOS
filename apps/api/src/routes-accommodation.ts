import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  HOUSEKEEPING_STATUSES,
  MAINTENANCE_STATUSES,
  PROPERTY_TYPES,
  RESERVATION_STATUSES,
  CALENDAR_VIEWS,
} from "@hospitalityos/shared";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  assertSameTenant,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireAccommodationModule } from "./lib/module-gate.js";
import { prisma } from "./db.js";
import { parseJsonArray } from "./lib/crypto.js";
import { writeAudit } from "./lib/audit.js";
import {
  createReservation,
  updateReservation,
  cancelReservation,
  checkInReservation,
  checkOutReservation,
  updateHousekeeping,
  updateMaintenance,
  buildCalendar,
  getAvailableRooms,
  startOfDay,
} from "./services/accommodation.js";

function mapProperty(p: {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  propertyType: string;
  status: string;
  timezone: string;
  checkInTime: string;
  checkOutTime: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  inheritBranding: boolean;
}) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    code: p.code,
    propertyType: p.propertyType,
    status: p.status,
    timezone: p.timezone,
    checkInTime: p.checkInTime,
    checkOutTime: p.checkOutTime,
    email: p.email,
    phone: p.phone,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    region: p.region,
    postalCode: p.postalCode,
    country: p.country,
    inheritBranding: p.inheritBranding,
  };
}

function mapRoomType(rt: {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  code: string;
  description: string | null;
  capacity: number;
  bedConfiguration: string | null;
  baseRate: number;
  currency: string;
  status: string;
  photoUrls: unknown;
  amenities?: Array<{ amenityId: string }>;
}) {
  return {
    id: rt.id,
    tenantId: rt.tenantId,
    propertyId: rt.propertyId,
    name: rt.name,
    code: rt.code,
    description: rt.description,
    capacity: rt.capacity,
    bedConfiguration: rt.bedConfiguration,
    baseRate: rt.baseRate,
    currency: rt.currency,
    status: rt.status,
    photoUrls: parseJsonArray(rt.photoUrls),
    amenityIds: (rt.amenities ?? []).map((a) => a.amenityId),
  };
}

function mapRoom(r: {
  id: string;
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  number: string;
  floorId: string | null;
  buildingId: string | null;
  occupancyStatus: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
  notes: string | null;
  status: string;
}) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    propertyId: r.propertyId,
    roomTypeId: r.roomTypeId,
    number: r.number,
    floorId: r.floorId,
    buildingId: r.buildingId,
    occupancyStatus: r.occupancyStatus,
    housekeepingStatus: r.housekeepingStatus,
    maintenanceStatus: r.maintenanceStatus,
    notes: r.notes,
    status: r.status,
  };
}

function mapReservation(r: {
  id: string;
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  roomId: string | null;
  customerId: string;
  bookingId?: string | null;
  status: string;
  checkInDate: Date;
  checkOutDate: Date;
  adults: number;
  children: number;
  confirmationCode: string;
  internalNotes: string | null;
  guestNotes: string | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    tenantId: r.tenantId,
    propertyId: r.propertyId,
    roomTypeId: r.roomTypeId,
    roomId: r.roomId,
    customerId: r.customerId,
    bookingId: r.bookingId ?? null,
    status: r.status,
    checkInDate: r.checkInDate.toISOString().slice(0, 10),
    checkOutDate: r.checkOutDate.toISOString().slice(0, 10),
    adults: r.adults,
    children: r.children,
    confirmationCode: r.confirmationCode,
    internalNotes: r.internalNotes,
    guestNotes: r.guestNotes,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    checkedOutAt: r.checkedOutAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

async function staffPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireAccommodationModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireAccommodationModule(req, reply);
  };
}

export async function registerAccommodationRoutes(app: FastifyInstance) {
  const staffAny = await staffPre();
  const staffManage = await staffPre(["owner", "admin", "manager", "front_desk"]);
  const staffOps = await staffPre(["owner", "admin", "manager", "front_desk", "operations"]);
  const staffAdmin = await staffPre(["owner", "admin", "manager"]);

  // ── Properties ───────────────────────────────────────────────
  app.get("/accommodation/properties", { preHandler: staffAny }, async (req) => {
    const rows = await prisma.property.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { properties: rows.map(mapProperty) };
  });

  app.post("/accommodation/properties", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        propertyType: z.enum(PROPERTY_TYPES),
        timezone: z.string().default("UTC"),
        checkInTime: z.string().default("15:00"),
        checkOutTime: z.string().default("11:00"),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        addressLine1: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        inheritBranding: z.boolean().optional(),
      })
      .parse(req.body);

    const property = await prisma.property.create({
      data: { tenantId: req.tenantId!, ...body },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "property.created",
      resource: "property",
      resourceId: property.id,
    });
    return { property: mapProperty(property) };
  });

  app.get("/accommodation/properties/:id", { preHandler: staffAny }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || !assertSameTenant(property.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    return { property: mapProperty(property) };
  });

  app.patch("/accommodation/properties/:id", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.property.findUnique({ where: { id } });
    if (!existing || !assertSameTenant(existing.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z
      .object({
        name: z.string().min(1).optional(),
        status: z.enum(["active", "inactive"]).optional(),
        checkInTime: z.string().optional(),
        checkOutTime: z.string().optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        addressLine1: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        inheritBranding: z.boolean().optional(),
      })
      .parse(req.body);
    const property = await prisma.property.update({ where: { id }, data: body });
    return { property: mapProperty(property) };
  });

  // ── Amenities ────────────────────────────────────────────────
  app.get("/accommodation/amenities", { preHandler: staffAny }, async (req) => {
    const amenities = await prisma.amenity.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { amenities };
  });

  app.post("/accommodation/amenities", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        category: z.string().default("general"),
      })
      .parse(req.body);
    const amenity = await prisma.amenity.create({
      data: { tenantId: req.tenantId!, ...body },
    });
    return { amenity };
  });

  // ── Room types ───────────────────────────────────────────────
  app.get("/accommodation/room-types", { preHandler: staffAny }, async (req) => {
    const q = req.query as { propertyId?: string };
    const rows = await prisma.roomType.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.propertyId ? { propertyId: q.propertyId } : {}),
      },
      include: { amenities: true },
      orderBy: { name: "asc" },
    });
    return { roomTypes: rows.map(mapRoomType) };
  });

  app.post("/accommodation/room-types", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        propertyId: z.string().min(1),
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        capacity: z.number().int().positive().default(2),
        bedConfiguration: z.string().optional(),
        baseRate: z.number().nonnegative().default(0),
        currency: z.string().default("USD"),
        photoUrls: z.array(z.string()).default([]),
        amenityIds: z.array(z.string()).default([]),
      })
      .parse(req.body);

    const property = await prisma.property.findFirst({
      where: { id: body.propertyId, tenantId: req.tenantId! },
    });
    if (!property) return tenantNotFound(reply);

    const roomType = await prisma.roomType.create({
      data: {
        tenantId: req.tenantId!,
        propertyId: body.propertyId,
        name: body.name,
        code: body.code,
        description: body.description,
        capacity: body.capacity,
        bedConfiguration: body.bedConfiguration,
        baseRate: body.baseRate,
        currency: body.currency,
        photoUrls: body.photoUrls,
        amenities: {
          create: body.amenityIds.map((amenityId) => ({ amenityId })),
        },
      },
      include: { amenities: true },
    });
    return { roomType: mapRoomType(roomType) };
  });

  app.get("/accommodation/room-types/:id", { preHandler: staffAny }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const roomType = await prisma.roomType.findUnique({
      where: { id },
      include: { amenities: true },
    });
    if (!roomType || !assertSameTenant(roomType.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    return { roomType: mapRoomType(roomType) };
  });

  app.patch("/accommodation/room-types/:id", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.roomType.findUnique({ where: { id } });
    if (!existing || !assertSameTenant(existing.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        capacity: z.number().int().positive().optional(),
        bedConfiguration: z.string().nullable().optional(),
        baseRate: z.number().nonnegative().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        photoUrls: z.array(z.string()).optional(),
        amenityIds: z.array(z.string()).optional(),
      })
      .parse(req.body);

    if (body.amenityIds) {
      await prisma.roomTypeAmenity.deleteMany({ where: { roomTypeId: id } });
      await prisma.roomTypeAmenity.createMany({
        data: body.amenityIds.map((amenityId) => ({ roomTypeId: id, amenityId })),
      });
    }

    const { amenityIds: _a, ...rest } = body;
    const roomType = await prisma.roomType.update({
      where: { id },
      data: rest,
      include: { amenities: true },
    });
    return { roomType: mapRoomType(roomType) };
  });

  // ── Rooms ────────────────────────────────────────────────────
  app.get("/accommodation/rooms", { preHandler: staffAny }, async (req) => {
    const q = req.query as { propertyId?: string; roomTypeId?: string };
    const rows = await prisma.room.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.propertyId ? { propertyId: q.propertyId } : {}),
        ...(q.roomTypeId ? { roomTypeId: q.roomTypeId } : {}),
      },
      orderBy: { number: "asc" },
    });
    return { rooms: rows.map(mapRoom) };
  });

  app.post("/accommodation/rooms", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        propertyId: z.string().min(1),
        roomTypeId: z.string().min(1),
        number: z.string().min(1),
        buildingId: z.string().optional(),
        floorId: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const roomType = await prisma.roomType.findFirst({
      where: {
        id: body.roomTypeId,
        propertyId: body.propertyId,
        tenantId: req.tenantId!,
      },
    });
    if (!roomType) return tenantNotFound(reply);

    const room = await prisma.room.create({
      data: {
        tenantId: req.tenantId!,
        propertyId: body.propertyId,
        roomTypeId: body.roomTypeId,
        number: body.number,
        buildingId: body.buildingId,
        floorId: body.floorId,
        notes: body.notes,
      },
    });
    const { syncRoomToBookableResource } = await import("./services/booking-engine.js");
    await syncRoomToBookableResource({
      tenantId: req.tenantId!,
      roomId: room.id,
      roomNumber: room.number,
      capacity: 1,
    });
    return { room: mapRoom(room) };
  });

  app.patch("/accommodation/rooms/:id", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing || !assertSameTenant(existing.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z
      .object({
        notes: z.string().nullable().optional(),
        status: z.enum(["active", "inactive"]).optional(),
        roomTypeId: z.string().optional(),
      })
      .parse(req.body);
    const room = await prisma.room.update({ where: { id }, data: body });
    return { room: mapRoom(room) };
  });

  // ── Housekeeping / Maintenance ───────────────────────────────
  app.patch("/accommodation/rooms/:id/housekeeping", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ status: z.enum(HOUSEKEEPING_STATUSES) })
      .parse(req.body);
    try {
      const room = await updateHousekeeping({
        tenantId: req.tenantId!,
        roomId: id,
        status: body.status,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { room: mapRoom(room) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.patch("/accommodation/rooms/:id/maintenance", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum(MAINTENANCE_STATUSES),
        notes: z.string().nullable().optional(),
      })
      .parse(req.body);
    try {
      const room = await updateMaintenance({
        tenantId: req.tenantId!,
        roomId: id,
        status: body.status,
        notes: body.notes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { room: mapRoom(room) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // ── Reservations (staff) ─────────────────────────────────────
  app.get("/accommodation/reservations", { preHandler: staffAny }, async (req) => {
    const q = req.query as { propertyId?: string; status?: string };
    const rows = await prisma.accommodationReservation.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(q.propertyId ? { propertyId: q.propertyId } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { checkInDate: "asc" },
    });
    return { reservations: rows.map(mapReservation) };
  });

  app.get("/accommodation/reservations/:id", { preHandler: staffAny }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await prisma.accommodationReservation.findUnique({
      where: { id },
      include: { guests: true, timeline: { orderBy: { createdAt: "asc" } }, stay: true },
    });
    if (!row || !assertSameTenant(row.tenantId, req.tenantId!)) return tenantNotFound(reply);
    return {
      reservation: mapReservation(row),
      guests: row.guests,
      timeline: row.timeline,
      stay: row.stay,
    };
  });

  app.post("/accommodation/reservations", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        propertyId: z.string(),
        roomTypeId: z.string(),
        roomId: z.string().optional(),
        customerId: z.string(),
        checkInDate: z.string(),
        checkOutDate: z.string(),
        adults: z.number().int().positive().optional(),
        children: z.number().int().nonnegative().optional(),
        status: z.enum(RESERVATION_STATUSES).optional(),
        internalNotes: z.string().optional(),
        guestNotes: z.string().optional(),
      })
      .parse(req.body);

    try {
      const reservation = await createReservation({
        tenantId: req.tenantId!,
        propertyId: body.propertyId,
        roomTypeId: body.roomTypeId,
        roomId: body.roomId,
        customerId: body.customerId,
        checkInDate: new Date(body.checkInDate),
        checkOutDate: new Date(body.checkOutDate),
        adults: body.adults,
        children: body.children,
        status: body.status,
        internalNotes: body.internalNotes,
        guestNotes: body.guestNotes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation: mapReservation(reservation) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.patch("/accommodation/reservations/:id", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        checkInDate: z.string().optional(),
        checkOutDate: z.string().optional(),
        adults: z.number().int().positive().optional(),
        children: z.number().int().nonnegative().optional(),
        roomId: z.string().nullable().optional(),
        internalNotes: z.string().nullable().optional(),
        guestNotes: z.string().nullable().optional(),
        status: z.enum(RESERVATION_STATUSES).optional(),
      })
      .parse(req.body);

    try {
      const reservation = await updateReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        checkInDate: body.checkInDate ? new Date(body.checkInDate) : undefined,
        checkOutDate: body.checkOutDate ? new Date(body.checkOutDate) : undefined,
        adults: body.adults,
        children: body.children,
        roomId: body.roomId,
        internalNotes: body.internalNotes,
        guestNotes: body.guestNotes,
        status: body.status,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation: mapReservation(reservation) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/accommodation/reservations/:id/cancel", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const reservation = await cancelReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation: mapReservation(reservation) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/accommodation/reservations/:id/check-in", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ roomId: z.string().optional() }).parse(req.body ?? {});
    try {
      const reservation = await checkInReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        roomId: body.roomId,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation: mapReservation(reservation) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/accommodation/reservations/:id/check-out", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const reservation = await checkOutReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { reservation: mapReservation(reservation) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // ── Availability ─────────────────────────────────────────────
  app.get("/accommodation/availability", { preHandler: staffAny }, async (req, reply) => {
    const q = z
      .object({
        propertyId: z.string(),
        roomTypeId: z.string(),
        checkInDate: z.string(),
        checkOutDate: z.string(),
      })
      .parse(req.query);

    try {
      const rooms = await getAvailableRooms({
        tenantId: req.tenantId!,
        propertyId: q.propertyId,
        roomTypeId: q.roomTypeId,
        checkInDate: startOfDay(new Date(q.checkInDate)),
        checkOutDate: startOfDay(new Date(q.checkOutDate)),
      });
      return {
        available: rooms.length > 0,
        count: rooms.length,
        rooms: rooms.map(mapRoom),
      };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // ── Calendar ─────────────────────────────────────────────────
  app.get("/accommodation/calendar", { preHandler: staffAny }, async (req) => {
    const q = z
      .object({
        propertyId: z.string(),
        view: z.enum(CALENDAR_VIEWS).default("weekly"),
        date: z.string().optional(),
      })
      .parse(req.query);

    const calendar = await buildCalendar({
      tenantId: req.tenantId!,
      propertyId: q.propertyId,
      view: q.view,
      anchorDate: q.date ? new Date(q.date) : new Date(),
    });
    return { calendar };
  });

  // ── Guests (accommodation-enriched) ──────────────────────────
  app.get("/accommodation/guests", { preHandler: staffAny }, async (req) => {
    const customers = await prisma.customer.findMany({
      where: { tenantId: req.tenantId! },
      include: {
        reservations: { orderBy: { createdAt: "desc" }, take: 5 },
        guestNotes: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      guests: customers.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        email: c.email,
        phone: c.phone,
        lifeosUserId: c.lifeosUserId,
        trustId: c.trustId,
        preferences: c.preferences,
        loyaltyPlaceholder: c.loyaltyPlaceholder,
        stayCount: c.reservations.length,
        recentReservations: c.reservations.map(mapReservation),
        notes: c.guestNotes,
      })),
    };
  });

  app.post("/accommodation/guests/:id/notes", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer || !assertSameTenant(customer.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z.object({ body: z.string().min(1) }).parse(req.body);
    const note = await prisma.guestNote.create({
      data: {
        tenantId: req.tenantId!,
        customerId: id,
        body: body.body,
        createdBy: (req.auth as StaffAuth).staffId,
      },
    });
    return { note };
  });

  app.patch("/accommodation/guests/:id", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer || !assertSameTenant(customer.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    const body = z
      .object({
        displayName: z.string().min(1).optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        preferences: z.record(z.unknown()).optional(),
        loyaltyPlaceholder: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        displayName: body.displayName,
        email: body.email,
        phone: body.phone,
        ...(body.preferences
          ? { preferences: body.preferences as Prisma.InputJsonValue }
          : {}),
        ...(body.loyaltyPlaceholder
          ? { loyaltyPlaceholder: body.loyaltyPlaceholder as Prisma.InputJsonValue }
          : {}),
      },
    });
    return {
      guest: {
        id: updated.id,
        displayName: updated.displayName,
        email: updated.email,
        phone: updated.phone,
        preferences: updated.preferences,
        loyaltyPlaceholder: updated.loyaltyPlaceholder,
      },
    };
  });

  // ── Audit (accommodation-scoped listing) ─────────────────────
  app.get("/accommodation/audit-events", { preHandler: staffAdmin }, async (req) => {
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: req.tenantId!,
        OR: [
          { resource: { in: ["reservation", "room", "property"] } },
          {
            action: {
              in: [
                "reservation.created",
                "reservation.modified",
                "reservation.cancelled",
                "reservation.check_in",
                "reservation.check_out",
                "room.assigned",
                "housekeeping.updated",
                "maintenance.updated",
              ],
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { events: logs };
  });

  // ── Guest-facing accommodation ───────────────────────────────
  const guestPre = async (
    req: Parameters<typeof requireGuest>[0],
    reply: Parameters<typeof requireGuest>[1],
  ) => {
    await requireGuest(req, reply);
    if (reply.sent) return;
    await requireAccommodationModule(req, reply);
  };

  app.get("/guest/accommodation/properties", { preHandler: guestPre }, async (req) => {
    const rows = await prisma.property.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
      orderBy: { name: "asc" },
    });
    return { properties: rows.map(mapProperty) };
  });

  app.get("/guest/accommodation/properties/:id/room-types", { preHandler: guestPre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findFirst({
      where: { id, tenantId: req.tenantId!, status: "active" },
    });
    if (!property) return tenantNotFound(reply);
    const rows = await prisma.roomType.findMany({
      where: { propertyId: id, tenantId: req.tenantId!, status: "active" },
      include: { amenities: true },
    });
    return { roomTypes: rows.map(mapRoomType) };
  });

  app.get("/guest/accommodation/room-types/:id", { preHandler: guestPre }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const roomType = await prisma.roomType.findUnique({
      where: { id },
      include: { amenities: true, property: true },
    });
    if (!roomType || !assertSameTenant(roomType.tenantId, req.tenantId!)) {
      return tenantNotFound(reply);
    }
    return {
      roomType: mapRoomType(roomType),
      property: mapProperty(roomType.property),
    };
  });

  app.get("/guest/accommodation/availability", { preHandler: guestPre }, async (req) => {
    const q = z
      .object({
        propertyId: z.string(),
        roomTypeId: z.string(),
        checkInDate: z.string(),
        checkOutDate: z.string(),
      })
      .parse(req.query);

    const rooms = await getAvailableRooms({
      tenantId: req.tenantId!,
      propertyId: q.propertyId,
      roomTypeId: q.roomTypeId,
      checkInDate: startOfDay(new Date(q.checkInDate)),
      checkOutDate: startOfDay(new Date(q.checkOutDate)),
    });
    return { available: rooms.length > 0, count: rooms.length };
  });

  app.post("/guest/accommodation/reservations", { preHandler: guestPre }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        propertyId: z.string(),
        roomTypeId: z.string(),
        checkInDate: z.string(),
        checkOutDate: z.string(),
        adults: z.number().int().positive().optional(),
        children: z.number().int().nonnegative().optional(),
        guestNotes: z.string().optional(),
      })
      .parse(req.body);

    try {
      const reservation = await createReservation({
        tenantId: req.tenantId!,
        propertyId: body.propertyId,
        roomTypeId: body.roomTypeId,
        customerId: auth.customerId,
        checkInDate: new Date(body.checkInDate),
        checkOutDate: new Date(body.checkOutDate),
        adults: body.adults,
        children: body.children,
        guestNotes: body.guestNotes,
        status: "confirmed",
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { reservation: mapReservation(reservation) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/guest/accommodation/reservations", { preHandler: guestPre }, async (req) => {
    const auth = req.auth as GuestAuth;
    const rows = await prisma.accommodationReservation.findMany({
      where: { tenantId: req.tenantId!, customerId: auth.customerId },
      orderBy: { checkInDate: "desc" },
      include: { property: true, roomType: true },
    });
    const now = startOfDay(new Date());
    return {
      reservations: rows.map((r) => ({
        ...mapReservation(r),
        propertyName: r.property.name,
        roomTypeName: r.roomType.name,
        upcoming:
          ["confirmed", "pending", "checked_in"].includes(r.status) &&
          r.checkOutDate >= now,
      })),
    };
  });

  app.post("/guest/accommodation/reservations/:id/cancel", { preHandler: guestPre }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const existing = await prisma.accommodationReservation.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: auth.customerId },
    });
    if (!existing) return tenantNotFound(reply);
    if (!["draft", "pending", "confirmed"].includes(existing.status)) {
      return reply.code(409).send({
        error: "invalid_state",
        message: "This reservation can no longer be cancelled",
      });
    }
    try {
      const reservation = await cancelReservation({
        tenantId: req.tenantId!,
        reservationId: id,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { reservation: mapReservation(reservation) };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });
}
