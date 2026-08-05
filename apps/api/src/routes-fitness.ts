import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ACCESS_PASS_KINDS,
  ATTENDANCE_STATUSES,
  FITNESS_AREA_TYPES,
} from "@hospitalityos/shared";
import {
  requireGuest,
  requireStaff,
  requireStaffRoles,
  tenantNotFound,
  type StaffAuth,
  type GuestAuth,
} from "./lib/auth.js";
import { requireGymModule } from "./lib/module-gate.js";
import { prisma } from "./db.js";
import { writeAudit } from "./lib/audit.js";
import {
  assertActiveMembership,
  bookClassSession,
  bookPersonalTraining,
  cancelClassBooking,
  checkIn,
  createAccessPass,
  createClassSession,
  createMembership,
  createMembershipPlan,
  recordAttendance,
  transitionMembership,
} from "./services/fitness.js";

async function staffPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireGymModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireGymModule(req, reply);
  };
}

async function guestPre() {
  return async (req: Parameters<typeof requireGuest>[0], reply: Parameters<typeof requireGuest>[1]) => {
    await requireGuest(req, reply);
    if (reply.sent) return;
    await requireGymModule(req, reply);
  };
}

export async function registerFitnessRoutes(app: FastifyInstance) {
  const staffAny = await staffPre();
  const staffManage = await staffPre([
    "owner",
    "admin",
    "manager",
    "front_desk",
    "operations",
    "trainer",
    "instructor",
  ]);
  const staffAdmin = await staffPre(["owner", "admin", "manager"]);
  const guest = await guestPre();

  app.get("/fitness/dashboard", { preHandler: staffAny }, async (req) => {
    const tenantId = req.tenantId!;
    const [members, activeMemberships, sessions, checkIns] = await Promise.all([
      prisma.memberProfile.count({ where: { tenantId } }),
      prisma.membership.count({ where: { tenantId, status: "active" } }),
      prisma.classSession.count({
        where: { tenantId, startsAt: { gte: new Date() }, status: "scheduled" },
      }),
      prisma.fitnessCheckIn.count({
        where: {
          tenantId,
          checkedInAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return { members, activeMemberships, upcomingSessions: sessions, checkInsToday: checkIns };
  });

  // Facilities & areas
  app.get("/fitness/facilities", { preHandler: staffAny }, async (req) => {
    const facilities = await prisma.fitnessFacility.findMany({
      where: { tenantId: req.tenantId! },
      include: { areas: true },
      orderBy: { name: "asc" },
    });
    return { facilities };
  });

  app.post("/fitness/facilities", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
      })
      .parse(req.body);
    const facility = await prisma.fitnessFacility.create({
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
      action: "fitness_facility.created",
      resource: "fitness_facility",
      resourceId: facility.id,
    });
    return { facility };
  });

  app.post("/fitness/facilities/:id/areas", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const facility = await prisma.fitnessFacility.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!facility) return tenantNotFound(reply);
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        areaType: z.enum(FITNESS_AREA_TYPES).optional(),
        capacity: z.number().int().positive().optional(),
      })
      .parse(req.body);
    const area = await prisma.fitnessArea.create({
      data: {
        tenantId: req.tenantId!,
        facilityId: id,
        name: body.name,
        code: body.code,
        areaType: body.areaType ?? "gym_floor",
        capacity: body.capacity,
        metadata: {},
        status: "active",
      },
    });
    return { area };
  });

  // Plans
  app.get("/fitness/plans", { preHandler: staffAny }, async (req) => {
    const plans = await prisma.membershipPlan.findMany({
      where: { tenantId: req.tenantId! },
      include: { benefits: true },
      orderBy: { name: "asc" },
    });
    return { plans };
  });

  app.post("/fitness/plans", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        durationDays: z.number().int().positive().optional(),
        price: z.number().nonnegative().optional(),
        facilityId: z.string().optional(),
        guestPrivileges: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const plan = await createMembershipPlan({
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

  // Memberships
  app.get("/fitness/memberships", { preHandler: staffAny }, async (req) => {
    const memberships = await prisma.membership.findMany({
      where: { tenantId: req.tenantId! },
      include: { plan: true, periods: true, freezes: true },
      orderBy: { createdAt: "desc" },
    });
    return { memberships };
  });

  app.post("/fitness/memberships", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        planId: z.string(),
        customerId: z.string(),
        activate: z.boolean().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const membership = await createMembership({
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

  app.post("/fitness/memberships/:id/:action", { preHandler: staffManage }, async (req, reply) => {
    const { id, action } = req.params as { id: string; action: string };
    if (!["activate", "freeze", "resume", "cancel", "expire", "renew"].includes(action)) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid action" });
    }
    const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    try {
      const membership = await transitionMembership({
        tenantId: req.tenantId!,
        membershipId: id,
        action: action as "activate" | "freeze" | "resume" | "cancel" | "expire" | "renew",
        reason: body.reason,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { membership };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/fitness/members", { preHandler: staffAny }, async (req) => {
    const members = await prisma.memberProfile.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { displayName: "asc" },
    });
    return { members };
  });

  // Classes
  app.get("/fitness/classes", { preHandler: staffAny }, async (req) => {
    const classes = await prisma.fitnessClass.findMany({
      where: { tenantId: req.tenantId! },
      include: { classType: true, trainers: { include: { trainer: true } } },
      orderBy: { name: "asc" },
    });
    return { classes };
  });

  app.post("/fitness/classes", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        capacity: z.number().int().positive().optional(),
        durationMinutes: z.number().int().positive().optional(),
        facilityId: z.string().optional(),
        areaId: z.string().optional(),
        classTypeId: z.string().optional(),
        membershipRequired: z.boolean().optional(),
      })
      .parse(req.body);
    const fitnessClass = await prisma.fitnessClass.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        capacity: body.capacity ?? 20,
        durationMinutes: body.durationMinutes ?? 60,
        facilityId: body.facilityId,
        areaId: body.areaId,
        classTypeId: body.classTypeId,
        membershipRequired: body.membershipRequired ?? false,
        metadata: {},
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "fitness_class.created",
      resource: "fitness_class",
      resourceId: fitnessClass.id,
    });
    return { class: fitnessClass };
  });

  app.get("/fitness/sessions", { preHandler: staffAny }, async (req) => {
    const sessions = await prisma.classSession.findMany({
      where: { tenantId: req.tenantId! },
      include: {
        fitnessClass: true,
        trainer: true,
        bookings: true,
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    return { sessions };
  });

  app.post("/fitness/sessions", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        classId: z.string(),
        startsAt: z.string(),
        endsAt: z.string().optional(),
        capacity: z.number().int().positive().optional(),
        areaId: z.string().optional(),
        trainerId: z.string().optional(),
      })
      .parse(req.body);
    try {
      const session = await createClassSession({
        tenantId: req.tenantId!,
        classId: body.classId,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        capacity: body.capacity,
        areaId: body.areaId,
        trainerId: body.trainerId,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { session };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/fitness/sessions/:id/book", { preHandler: staffManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        customerId: z.string(),
        joinWaitlistIfUnavailable: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookClassSession({
        tenantId: req.tenantId!,
        sessionId: id,
        customerId: body.customerId,
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

  // Trainers
  app.get("/fitness/trainers", { preHandler: staffAny }, async (req) => {
    const trainers = await prisma.trainer.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { displayName: "asc" },
    });
    return { trainers };
  });

  app.post("/fitness/trainers", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({
        displayName: z.string().min(1),
        email: z.string().email().optional(),
        specializations: z.array(z.string()).optional(),
        bio: z.string().optional(),
        staffId: z.string().optional(),
      })
      .parse(req.body);
    const trainer = await prisma.trainer.create({
      data: {
        tenantId: req.tenantId!,
        displayName: body.displayName,
        email: body.email,
        specializations: body.specializations ?? [],
        bio: body.bio,
        staffId: body.staffId,
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "trainer.created",
      resource: "trainer",
      resourceId: trainer.id,
    });
    return { trainer };
  });

  app.post("/fitness/training-sessions", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        trainerId: z.string(),
        customerId: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookPersonalTraining({
        tenantId: req.tenantId!,
        trainerId: body.trainerId,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        notes: body.notes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/fitness/training-sessions", { preHandler: staffAny }, async (req) => {
    const sessions = await prisma.trainingSession.findMany({
      where: { tenantId: req.tenantId! },
      include: { trainer: true },
      orderBy: { startsAt: "desc" },
      take: 100,
    });
    return { sessions };
  });

  // Attendance & check-ins
  app.get("/fitness/attendance", { preHandler: staffAny }, async (req) => {
    const rows = await prisma.attendance.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { recordedAt: "desc" },
      take: 100,
    });
    return { attendance: rows };
  });

  app.post("/fitness/attendance", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        customerId: z.string(),
        sessionId: z.string().optional(),
        trainingId: z.string().optional(),
        kind: z.string().optional(),
        status: z.enum(ATTENDANCE_STATUSES).optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const attendance = await recordAttendance({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { attendance };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/fitness/check-ins", { preHandler: staffAny }, async (req) => {
    const checkIns = await prisma.fitnessCheckIn.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { checkedInAt: "desc" },
      take: 100,
    });
    return { checkIns };
  });

  app.post("/fitness/check-ins", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        customerId: z.string(),
        facilityId: z.string().optional(),
        areaId: z.string().optional(),
        kind: z.string().optional(),
      })
      .parse(req.body);
    try {
      const row = await checkIn({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { checkIn: row };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Access passes
  app.get("/fitness/access-passes", { preHandler: staffAny }, async (req) => {
    const passes = await prisma.accessPass.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
    });
    return { passes };
  });

  app.post("/fitness/access-passes", { preHandler: staffManage }, async (req, reply) => {
    const body = z
      .object({
        kind: z.enum(ACCESS_PASS_KINDS),
        customerId: z.string().optional(),
        startsAt: z.string(),
        expiresAt: z.string(),
        allowedAreas: z.array(z.string()).optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const pass = await createAccessPass({
        tenantId: req.tenantId!,
        kind: body.kind,
        customerId: body.customerId,
        startsAt: new Date(body.startsAt),
        expiresAt: new Date(body.expiresAt),
        allowedAreas: body.allowedAreas,
        notes: body.notes,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { pass };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  // Class types
  app.post("/fitness/class-types", { preHandler: staffAdmin }, async (req) => {
    const body = z
      .object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional() })
      .parse(req.body);
    const classType = await prisma.classType.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description,
        status: "active",
      },
    });
    return { classType };
  });

  // ── Guest ────────────────────────────────────────────────────
  app.get("/guest/fitness/home", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const [membership, upcoming, training, attendance] = await Promise.all([
      prisma.membership.findFirst({
        where: { tenantId: req.tenantId!, customerId: auth.customerId, status: { in: ["active", "frozen"] } },
        include: { plan: { include: { benefits: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.classBooking.findMany({
        where: {
          tenantId: req.tenantId!,
          customerId: auth.customerId,
          status: "confirmed",
          session: { startsAt: { gte: new Date() } },
        },
        include: { session: { include: { fitnessClass: true } } },
        take: 10,
      }),
      prisma.trainingSession.findMany({
        where: {
          tenantId: req.tenantId!,
          customerId: auth.customerId,
          startsAt: { gte: new Date() },
          status: "confirmed",
        },
        include: { trainer: true },
        take: 10,
      }),
      prisma.attendance.findMany({
        where: { tenantId: req.tenantId!, customerId: auth.customerId },
        orderBy: { recordedAt: "desc" },
        take: 20,
      }),
    ]);
    const profile = await prisma.memberProfile.findUnique({
      where: {
        tenantId_customerId: { tenantId: req.tenantId!, customerId: auth.customerId },
      },
    });
    return {
      profile,
      membership,
      upcomingClasses: upcoming,
      upcomingTraining: training,
      attendance,
    };
  });

  app.get("/guest/fitness/plans", { preHandler: guest }, async (req) => {
    const plans = await prisma.membershipPlan.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
      include: { benefits: true },
      orderBy: { price: "asc" },
    });
    return { plans };
  });

  app.get("/guest/fitness/sessions", { preHandler: guest }, async (req) => {
    const sessions = await prisma.classSession.findMany({
      where: {
        tenantId: req.tenantId!,
        status: "scheduled",
        startsAt: { gte: new Date() },
      },
      include: { fitnessClass: true, trainer: true },
      orderBy: { startsAt: "asc" },
      take: 50,
    });
    return { sessions };
  });

  app.post("/guest/fitness/sessions/:id/book", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    try {
      const result = await bookClassSession({
        tenantId: req.tenantId!,
        sessionId: id,
        customerId: auth.customerId,
        joinWaitlistIfUnavailable: true,
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

  app.get("/guest/fitness/trainers", { preHandler: guest }, async (req) => {
    const trainers = await prisma.trainer.findMany({
      where: { tenantId: req.tenantId!, status: "active" },
      orderBy: { displayName: "asc" },
    });
    return { trainers };
  });

  app.post("/guest/fitness/training-sessions", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        trainerId: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = await bookPersonalTraining({
        tenantId: req.tenantId!,
        trainerId: body.trainerId,
        customerId: auth.customerId,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        notes: body.notes,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return result;
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.post("/guest/fitness/check-in", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const body = z
      .object({
        facilityId: z.string().optional(),
        areaId: z.string().optional(),
        kind: z.string().optional(),
      })
      .parse(req.body ?? {});
    try {
      await assertActiveMembership({
        tenantId: req.tenantId!,
        customerId: auth.customerId,
        required: false,
      });
      const row = await checkIn({
        tenantId: req.tenantId!,
        customerId: auth.customerId,
        facilityId: body.facilityId,
        areaId: body.areaId,
        kind: body.kind ?? "gym",
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { checkIn: row };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });

  app.get("/guest/fitness/access-passes", { preHandler: guest }, async (req) => {
    const auth = req.auth as GuestAuth;
    const passes = await prisma.accessPass.findMany({
      where: { tenantId: req.tenantId!, customerId: auth.customerId },
      orderBy: { createdAt: "desc" },
    });
    return { passes };
  });

  app.post("/guest/fitness/bookings/:id/cancel", { preHandler: guest }, async (req, reply) => {
    const auth = req.auth as GuestAuth;
    const { id } = req.params as { id: string };
    const existing = await prisma.classBooking.findFirst({
      where: { id, tenantId: req.tenantId!, customerId: auth.customerId },
    });
    if (!existing) return tenantNotFound(reply);
    try {
      const booking = await cancelClassBooking({
        tenantId: req.tenantId!,
        classBookingId: id,
        actorKind: "guest",
        actorId: auth.customerId,
      });
      return { booking };
    } catch (err) {
      const e = err as Error & { code?: string; statusCode?: number };
      return reply.code(e.statusCode ?? 400).send({ error: e.code ?? "error", message: e.message });
    }
  });
}
