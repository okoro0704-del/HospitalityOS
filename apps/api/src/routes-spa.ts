import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  SPA_ROOM_TYPES,
  SPA_ROOM_STATUSES,
  WELLNESS_AREA_TYPES,
  SPA_SENSITIVE_NOTE_ROLES,
  type StaffRole,
} from "@hospitalityos/shared";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireSpaModule } from "./lib/module-gate.js";
import { prisma } from "./db.js";
import { writeAudit } from "./lib/audit.js";
import {
  activateSpaMembership,
  bookSpaAppointment,
  bookWellnessFacility,
  cancelSpaAppointment,
  completeSpaAppointment,
  createSpaMembershipPlan,
  createSpaPackage,
  createTreatment,
  createTreatmentVariant,
  ensureRoomResource,
  ensureTherapistResource,
} from "./services/spa.js";

async function staffPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireSpaModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireSpaModule(req, reply);
  };
}

async function guestPre() {
  return async (req: Parameters<typeof requireGuest>[0], reply: Parameters<typeof requireGuest>[1]) => {
    await requireGuest(req, reply);
    if (reply.sent) return;
    await requireSpaModule(req, reply);
  };
}

function canAccessSensitiveNotes(role: string) {
  return (SPA_SENSITIVE_NOTE_ROLES as readonly string[]).includes(role);
}

export async function registerSpaRoutes(app: FastifyInstance) {
  const staffAny = await staffPre();
  const staffOps = await staffPre([
    "owner",
    "admin",
    "manager",
    "spa_manager",
    "front_desk",
    "reception",
    "operations",
    "spa_therapist",
    "wellness_instructor",
  ]);
  const staffAdmin = await staffPre(["owner", "admin", "manager", "spa_manager"]);
  const staffNotes = await staffPre([...SPA_SENSITIVE_NOTE_ROLES] as StaffRole[]);
  const guest = await guestPre();

  app.get("/spa/dashboard", { preHandler: staffAny }, async (req) => {
    const tenantId = req.tenantId!;
    const now = new Date();
    const [appointmentsToday, therapists, rooms, waitlist] = await Promise.all([
      prisma.spaAppointment.count({
        where: {
          tenantId,
          startsAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
          status: { not: "cancelled" },
        },
      }),
      prisma.spaTherapist.count({ where: { tenantId, status: "active" } }),
      prisma.treatmentRoom.count({ where: { tenantId } }),
      prisma.waitlistEntry.count({
        where: { tenantId, moduleId: "spa_services", status: "waiting" },
      }),
    ]);
    return { appointmentsToday, therapists, rooms, waitlist };
  });

  // Facilities
  app.get("/spa/facilities", { preHandler: staffAny }, async (req) => {
    const facilities = await prisma.spaFacility.findMany({
      where: { tenantId: req.tenantId! },
      include: { rooms: true, areas: true },
      orderBy: { name: "asc" },
    });
    return { facilities };
  });

  app.post("/spa/facilities", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional() })
      .parse(req.body);
    const facility = await prisma.spaFacility.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        metadata: {},
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "spa_facility.created",
      resource: "spa_facility",
      resourceId: facility.id,
    });
    return { facility };
  });

  app.post("/spa/facilities/:id/rooms", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const facility = await prisma.spaFacility.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!facility) return tenantNotFound(reply);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        roomType: z.enum(SPA_ROOM_TYPES).optional(),
        capacity: z.number().int().positive().optional(),
        compatibleTreatments: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const room = await prisma.treatmentRoom.create({
      data: {
        tenantId: req.tenantId!,
        facilityId: id,
        name: body.name,
        code: body.code,
        roomType: body.roomType ?? "massage",
        capacity: body.capacity ?? 1,
        compatibleTreatments: body.compatibleTreatments ?? [],
        status: "available",
        metadata: {},
      },
    });
    await ensureRoomResource({ tenantId: req.tenantId!, roomId: room.id });
    const refreshed = await prisma.treatmentRoom.findUniqueOrThrow({ where: { id: room.id } });
    return { room: refreshed };
  });

  app.patch("/spa/rooms/:id/status", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(SPA_ROOM_STATUSES), maintenanceNotes: z.string().optional() }).parse(req.body);
    const existing = await prisma.treatmentRoom.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!existing) return tenantNotFound(reply);
    const room = await prisma.treatmentRoom.update({
      where: { id },
      data: { status: body.status, maintenanceNotes: body.maintenanceNotes },
    });
    return { room };
  });

  app.get("/spa/rooms", { preHandler: staffAny }, async (req) => {
    const rooms = await prisma.treatmentRoom.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { rooms };
  });

  app.post("/spa/facilities/:id/areas", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const facility = await prisma.spaFacility.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!facility) return tenantNotFound(reply);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        areaType: z.enum(WELLNESS_AREA_TYPES).optional(),
        capacity: z.number().int().positive().optional(),
        membershipRequired: z.boolean().optional(),
      })
      .parse(req.body);
    const area = await prisma.wellnessArea.create({
      data: {
        tenantId: req.tenantId!,
        facilityId: id,
        name: body.name,
        code: body.code,
        areaType: body.areaType ?? "wellness",
        capacity: body.capacity,
        membershipRequired: body.membershipRequired ?? false,
        status: "active",
        metadata: {},
      },
    });
    return { area };
  });

  // Treatments
  app.get("/spa/treatments", { preHandler: staffAny }, async (req) => {
    const treatments = await prisma.treatment.findMany({
      where: { tenantId: req.tenantId! },
      include: { category: true, variants: true },
      orderBy: { name: "asc" },
    });
    return { treatments };
  });

  app.post("/spa/treatments", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        durationMinutes: z.number().int().positive().optional(),
        price: z.number().nonnegative().optional(),
        facilityId: z.string().optional(),
        categoryId: z.string().optional(),
        requiredRoomTypes: z.array(z.string()).optional(),
        requiredSpecialties: z.array(z.string()).optional(),
      })
      .parse(req.body);
    try {
      const treatment = await createTreatment({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { treatment };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/spa/treatments/:id/variants", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        durationMinutes: z.number().int().positive(),
        price: z.number().nonnegative().optional(),
      })
      .parse(req.body);
    try {
      const variant = await createTreatmentVariant({
        tenantId: req.tenantId!,
        treatmentId: id,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { variant };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/spa/categories", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional() })
      .parse(req.body);
    const category = await prisma.treatmentCategory.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        status: "active",
      },
    });
    return { category };
  });

  // Therapists
  app.get("/spa/therapists", { preHandler: staffAny }, async (req) => {
    const therapists = await prisma.spaTherapist.findMany({
      where: { tenantId: req.tenantId! },
      include: { specialties: true, treatments: true },
      orderBy: { displayName: "asc" },
    });
    return { therapists };
  });

  app.post("/spa/therapists", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        displayName: z.string().min(1),
        email: z.string().email().optional(),
        bio: z.string().optional(),
        specialties: z.array(z.object({ name: z.string(), code: z.string() })).optional(),
        staffId: z.string().optional(),
      })
      .parse(req.body);
    const therapist = await prisma.spaTherapist.create({
      data: {
        tenantId: req.tenantId!,
        displayName: body.displayName,
        email: body.email,
        bio: body.bio,
        staffId: body.staffId,
        workingHours: {},
        status: "active",
        specialties: body.specialties
          ? {
              create: body.specialties.map((s) => ({
                tenantId: req.tenantId!,
                name: s.name,
                code: s.code,
              })),
            }
          : undefined,
      },
      include: { specialties: true },
    });
    await ensureTherapistResource({ tenantId: req.tenantId!, therapistId: therapist.id });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "spa_therapist.created",
      resource: "spa_therapist",
      resourceId: therapist.id,
    });
    return { therapist: await prisma.spaTherapist.findUniqueOrThrow({ where: { id: therapist.id }, include: { specialties: true } }) };
  });

  app.post("/spa/therapists/:id/treatments", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ treatmentId: z.string() }).parse(req.body);
    const therapist = await prisma.spaTherapist.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!therapist) return tenantNotFound(reply);
    const link = await prisma.therapistTreatmentLink.upsert({
      where: { therapistId_treatmentId: { therapistId: id, treatmentId: body.treatmentId } },
      create: {
        tenantId: req.tenantId!,
        therapistId: id,
        treatmentId: body.treatmentId,
        status: "active",
      },
      update: { status: "active" },
    });
    return { link };
  });

  // Appointments
  app.get("/spa/appointments", { preHandler: staffAny }, async (req) => {
    const appointments = await prisma.spaAppointment.findMany({
      where: { tenantId: req.tenantId! },
      include: { treatment: true, therapist: true, room: true, variant: true },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    return { appointments };
  });

  app.post("/spa/appointments", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        customerId: z.string(),
        treatmentId: z.string(),
        variantId: z.string().optional(),
        therapistId: z.string().optional(),
        roomId: z.string().optional(),
        startsAt: z.string(),
        endsAt: z.string().optional(),
        notes: z.string().optional(),
        addonOfferingIds: z.array(z.string()).optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookSpaAppointment({
        tenantId: req.tenantId!,
        customerId: body.customerId,
        treatmentId: body.treatmentId,
        variantId: body.variantId,
        therapistId: body.therapistId,
        roomId: body.roomId,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        notes: body.notes,
        addonOfferingIds: body.addonOfferingIds,
        joinWaitlistIfUnavailable: body.joinWaitlistIfUnavailable,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.post("/spa/appointments/:id/cancel", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const appointment = await cancelSpaAppointment({
        tenantId: req.tenantId!,
        appointmentId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { appointment };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/spa/appointments/:id/complete", { preHandler: staffNotes }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        generalNotes: z.string().optional(),
        aftercareInstructions: z.string().optional(),
        therapistId: z.string().optional(),
      })
      .parse(req.body ?? {});
    try {
      const result = await completeSpaAppointment({
        tenantId: req.tenantId!,
        appointmentId: id,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Clients
  app.get("/spa/clients", { preHandler: staffAny }, async (req) => {
    const clients = await prisma.spaClientProfile.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { displayName: "asc" },
    });
    return { clients };
  });

  app.patch("/spa/clients/:customerId", { preHandler: staffOps }, async (req, reply) => {
    const { customerId } = req.params as { customerId: string };
    const body = z
      .object({
        allergies: z.string().optional(),
        sensitivities: z.string().optional(),
        preferredTherapistId: z.string().nullable().optional(),
        notes: z.string().optional(),
        preferences: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId: req.tenantId! },
    });
    if (!customer) return tenantNotFound(reply);
    const client = await prisma.spaClientProfile.upsert({
      where: { tenantId_customerId: { tenantId: req.tenantId!, customerId } },
      create: {
        tenantId: req.tenantId!,
        customerId,
        displayName: customer.displayName,
        allergies: body.allergies,
        sensitivities: body.sensitivities,
        preferredTherapistId: body.preferredTherapistId ?? null,
        notes: body.notes,
        preferences: (body.preferences ?? {}) as object,
      },
      update: {
        allergies: body.allergies,
        sensitivities: body.sensitivities,
        preferredTherapistId: body.preferredTherapistId,
        notes: body.notes,
        preferences: body.preferences as object | undefined,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "spa_client.updated",
      resource: "spa_client_profile",
      resourceId: client.id,
    });
    return { client };
  });

  // Consultations & notes (sensitive)
  app.get("/spa/consultations", { preHandler: staffNotes }, async (req, reply) => {
    const role = (req.auth as StaffAuth).role;
    if (!canAccessSensitiveNotes(role)) {
      return reply.code(403).send({ error: "forbidden", message: "Sensitive notes restricted" });
    }
    const consultations = await prisma.spaConsultation.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { consultedAt: "desc" },
      take: 100,
    });
    return { consultations };
  });

  app.post("/spa/consultations", { preHandler: staffNotes }, async (req) => {
    const body = z
      .object({
        customerId: z.string(),
        treatmentId: z.string().optional(),
        notes: z.string().optional(),
        recommendations: z.string().optional(),
        followUpAt: z.string().optional(),
      })
      .parse(req.body);
    const consultation = await prisma.spaConsultation.create({
      data: {
        tenantId: req.tenantId!,
        customerId: body.customerId,
        treatmentId: body.treatmentId,
        notes: body.notes,
        recommendations: body.recommendations,
        followUpAt: body.followUpAt ? new Date(body.followUpAt) : null,
        createdByStaffId: (req.auth as StaffAuth).staffId,
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "spa_consultation.created",
      resource: "spa_consultation",
      resourceId: consultation.id,
    });
    return { consultation };
  });

  app.get("/spa/treatment-notes", { preHandler: staffNotes }, async (req) => {
    const notes = await prisma.treatmentNote.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { notes };
  });

  // Wellness facility sessions
  app.post("/spa/facilities/sessions", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        areaId: z.string(),
        customerId: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        partySize: z.number().int().positive().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookWellnessFacility({
        tenantId: req.tenantId!,
        areaId: body.areaId,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        partySize: body.partySize,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/spa/facilities/sessions", { preHandler: staffAny }, async (req) => {
    const sessions = await prisma.wellnessFacilitySession.findMany({
      where: { tenantId: req.tenantId! },
      include: { area: true },
      orderBy: { startsAt: "desc" },
      take: 100,
    });
    return { sessions };
  });

  // Packages & memberships
  app.get("/spa/packages", { preHandler: staffAny }, async (req) => {
    const packages = await prisma.spaPackage.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { packages };
  });

  app.post("/spa/packages", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        items: z.array(z.unknown()).optional(),
      })
      .parse(req.body);
    try {
      const pkg = await createSpaPackage({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { package: pkg };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/spa/memberships", { preHandler: staffAny }, async (req) => {
    const [plans, memberships] = await Promise.all([
      prisma.spaMembershipPlan.findMany({ where: { tenantId: req.tenantId! } }),
      prisma.spaMembership.findMany({
        where: { tenantId: req.tenantId! },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { plans, memberships };
  });

  app.post("/spa/memberships/plans", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        durationDays: z.number().int().positive().optional(),
        price: z.number().nonnegative().optional(),
        benefits: z.array(z.unknown()).optional(),
      })
      .parse(req.body);
    try {
      const plan = await createSpaMembershipPlan({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { plan };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/spa/memberships", { preHandler: staffOps }, async (req, reply) => {
    const body = z.object({ planId: z.string(), customerId: z.string() }).parse(req.body);
    try {
      const membership = await activateSpaMembership({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { membership };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/spa/waitlist", { preHandler: staffAny }, async (req) => {
    const entries = await prisma.waitlistEntry.findMany({
      where: { tenantId: req.tenantId!, moduleId: "spa_services" },
      orderBy: { createdAt: "asc" },
    });
    return { entries };
  });

  // ── Guest ────────────────────────────────────────────────────
  app.get("/guest/spa/home", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const [treatments, appointments, aftercare, packages, membership] = await Promise.all([
      prisma.treatment.findMany({
        where: { tenantId: req.tenantId!, status: "active" },
        include: { variants: true, category: true },
        take: 20,
      }),
      prisma.spaAppointment.findMany({
        where: { tenantId: req.tenantId!, customerId: auth.customerId },
        include: { treatment: true, therapist: true },
        orderBy: { startsAt: "desc" },
        take: 20,
      }),
      prisma.aftercareNote.findMany({
        where: {
          tenantId: req.tenantId!,
          customerId: auth.customerId,
          visibleToGuest: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.spaPackage.findMany({
        where: { tenantId: req.tenantId!, status: "active" },
      }),
      prisma.spaMembership.findFirst({
        where: {
          tenantId: req.tenantId!,
          customerId: auth.customerId,
          status: "active",
        },
        include: { plan: true },
      }),
    ]);
    return { treatments, appointments, aftercare, packages, membership };
  });

  app.get("/guest/spa/treatments", { preHandler: guest }, async (req) => {
    const treatments = await prisma.treatment.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
      include: { variants: true, category: true },
      orderBy: { name: "asc" },
    });
    return { treatments };
  });

  app.get("/guest/spa/treatments/:id", { preHandler: guest }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const treatment = await prisma.treatment.findFirst({
      where: { id, tenantId: req.tenantId!, status: "active" },
      include: { variants: true, category: true },
    });
    if (!treatment) return tenantNotFound(reply);
    return { treatment };
  });

  app.get("/guest/spa/therapists", { preHandler: guest }, async (req) => {
    const therapists = await prisma.spaTherapist.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
      include: { specialties: true },
      orderBy: { displayName: "asc" },
    });
    return { therapists };
  });

  app.get("/guest/spa/appointments", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const appointments = await prisma.spaAppointment.findMany({
      where: { tenantId: req.tenantId!, customerId: auth.customerId },
      include: { treatment: true, therapist: true, room: true, variant: true },
      orderBy: { startsAt: "desc" },
    });
    return { appointments };
  });

  app.post("/guest/spa/appointments", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        treatmentId: z.string(),
        variantId: z.string().optional(),
        therapistId: z.string().optional(),
        roomId: z.string().optional(),
        startsAt: z.string(),
        notes: z.string().optional(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookSpaAppointment({
        tenantId: req.tenantId!,
        customerId: auth.customerId,
        treatmentId: body.treatmentId,
        variantId: body.variantId,
        therapistId: body.therapistId,
        roomId: body.roomId,
        startsAt: new Date(body.startsAt),
        notes: body.notes,
        joinWaitlistIfUnavailable: body.joinWaitlistIfUnavailable ?? true,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
      return reply.code(e.statusCode ?? 400).send({
        error: e.code ?? "error",
        message: e.message,
        waitlistEntry: e.waitlistEntry,
      });
    }
  });

  app.post("/guest/spa/appointments/:id/cancel", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const existing = await prisma.spaAppointment.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: auth.customerId },
    });
    if (!existing) return tenantNotFound(reply);
    try {
      const appointment = await cancelSpaAppointment({
        tenantId: req.tenantId!,
        appointmentId: id,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { appointment };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/guest/spa/packages", { preHandler: guest }, async (req) => {
    const packages = await prisma.spaPackage.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
    });
    return { packages };
  });

  app.get("/guest/spa/memberships", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const [plans, membership] = await Promise.all([
      prisma.spaMembershipPlan.findMany({
        where: { tenantId: req.tenantId!, status: "active" },
      }),
      prisma.spaMembership.findFirst({
        where: { tenantId: req.tenantId!, customerId: auth.customerId, status: "active" },
        include: { plan: true },
      }),
    ]);
    return { plans, membership };
  });

  app.get("/guest/spa/aftercare", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const aftercare = await prisma.aftercareNote.findMany({
      where: {
        tenantId: req.tenantId!,
        customerId: auth.customerId,
        visibleToGuest: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { aftercare };
  });
}
