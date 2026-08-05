import type { MembershipStatus } from "@hospitalityos/shared";
import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import {
  cancelBooking,
  createBooking,
  ensureDefaultCategories,
} from "./booking-engine.js";
import { createOffering, ensureDefaultCatalog } from "./commerce-engine.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function ensureFitnessCategory(tenantId: string) {
  await ensureDefaultCategories(tenantId);
  return prisma.resourceCategory.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "fitness" } },
  });
}

export async function createMembershipPlan(opts: {
  tenantId: string;
  facilityId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  durationDays?: number;
  price?: number;
  guestPrivileges?: boolean;
  accessRules?: Record<string, unknown>;
  includedClasses?: string[];
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "product",
    name: opts.name,
    code: `MEM-${opts.code}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "gym_membership",
    sku: opts.code,
    unit: "membership",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const plan = await prisma.membershipPlan.create({
    data: {
      tenantId: opts.tenantId,
      facilityId: opts.facilityId ?? null,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      durationDays: opts.durationDays ?? 30,
      price: opts.price ?? 0,
      accessRules: (opts.accessRules ?? {}) as object,
      includedClasses: opts.includedClasses ?? [],
      guestPrivileges: opts.guestPrivileges ?? false,
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "membership_plan.created",
    resource: "membership_plan",
    resourceId: plan.id,
    metadata: { offeringId: offering.id },
  });

  return plan;
}

export async function createMembership(opts: {
  tenantId: string;
  planId: string;
  customerId: string;
  activate?: boolean;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const plan = await prisma.membershipPlan.findFirst({
    where: { id: opts.planId, tenantId: opts.tenantId, status: "active" },
  });
  if (!plan) throw httpError("Membership plan not found", "not_found", 404);

  const customer = await prisma.customer.findFirst({
    where: { id: opts.customerId, tenantId: opts.tenantId },
  });
  if (!customer) throw httpError("Member not found", "not_found", 404);

  await prisma.memberProfile.upsert({
    where: {
      tenantId_customerId: { tenantId: opts.tenantId, customerId: opts.customerId },
    },
    create: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      displayName: customer.displayName,
      preferences: {},
    },
    update: { displayName: customer.displayName },
  });

  const activate = opts.activate !== false;
  const startsAt = activate ? new Date() : null;
  const endsAt = startsAt
    ? new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
    : null;

  const membership = await prisma.membership.create({
    data: {
      tenantId: opts.tenantId,
      planId: plan.id,
      customerId: opts.customerId,
      status: activate ? "active" : "pending",
      startsAt,
      endsAt,
      activatedAt: activate ? startsAt : null,
      notes: opts.notes ?? null,
      ...(activate && startsAt && endsAt
        ? {
            periods: {
              create: {
                tenantId: opts.tenantId,
                startsAt,
                endsAt,
                status: "active",
              },
            },
          }
        : {}),
    },
    include: { plan: true, periods: true },
  });

  if (activate) {
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: opts.customerId,
      title: "Membership activated",
      body: `Your ${plan.name} membership is now active.`,
      metadata: { membershipId: membership.id },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "membership.created",
    resource: "membership",
    resourceId: membership.id,
    metadata: { status: membership.status },
  });

  return membership;
}

export async function transitionMembership(opts: {
  tenantId: string;
  membershipId: string;
  action: "activate" | "freeze" | "resume" | "cancel" | "expire" | "renew";
  reason?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.membership.findFirst({
    where: { id: opts.membershipId, tenantId: opts.tenantId },
    include: { plan: true },
  });
  if (!existing) throw httpError("Membership not found", "not_found", 404);

  let status: MembershipStatus = existing.status as MembershipStatus;
  const now = new Date();

  if (opts.action === "activate") {
    if (!["draft", "pending", "expired", "cancelled"].includes(existing.status)) {
      throw httpError("Cannot activate membership", "invalid_state", 409);
    }
    status = "active";
    const endsAt = new Date(now.getTime() + existing.plan.durationDays * 86400000);
    await prisma.membership.update({
      where: { id: existing.id },
      data: {
        status,
        startsAt: now,
        endsAt,
        activatedAt: now,
        cancelledAt: null,
        periods: {
          create: {
            tenantId: opts.tenantId,
            startsAt: now,
            endsAt,
            status: "active",
          },
        },
      },
    });
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Membership activated",
      body: `Your ${existing.plan.name} membership is active.`,
      metadata: { membershipId: existing.id },
    });
  } else if (opts.action === "freeze") {
    if (existing.status !== "active") {
      throw httpError("Only active memberships can be frozen", "invalid_state", 409);
    }
    status = "frozen";
    await prisma.membership.update({
      where: { id: existing.id },
      data: { status },
    });
    await prisma.membershipFreeze.create({
      data: {
        tenantId: opts.tenantId,
        membershipId: existing.id,
        reason: opts.reason ?? null,
        startsAt: now,
        status: "active",
      },
    });
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Membership frozen",
      body: "Your membership has been paused.",
      metadata: { membershipId: existing.id },
    });
  } else if (opts.action === "resume") {
    if (existing.status !== "frozen") {
      throw httpError("Only frozen memberships can be resumed", "invalid_state", 409);
    }
    status = "active";
    await prisma.membership.update({
      where: { id: existing.id },
      data: { status },
    });
    await prisma.membershipFreeze.updateMany({
      where: { membershipId: existing.id, status: "active" },
      data: { status: "ended", resumedAt: now, endsAt: now },
    });
  } else if (opts.action === "cancel") {
    status = "cancelled";
    await prisma.membership.update({
      where: { id: existing.id },
      data: { status, cancelledAt: now },
    });
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Membership cancelled",
      body: "Your membership has been cancelled.",
      metadata: { membershipId: existing.id },
    });
  } else if (opts.action === "expire") {
    status = "expired";
    await prisma.membership.update({
      where: { id: existing.id },
      data: { status },
    });
  } else if (opts.action === "renew") {
    const endsAt = new Date(now.getTime() + existing.plan.durationDays * 86400000);
    status = "active";
    await prisma.membership.update({
      where: { id: existing.id },
      data: {
        status,
        startsAt: now,
        endsAt,
        activatedAt: now,
        cancelledAt: null,
        periods: {
          create: {
            tenantId: opts.tenantId,
            startsAt: now,
            endsAt,
            status: "active",
          },
        },
      },
    });
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: `membership.${opts.action}`,
    resource: "membership",
    resourceId: existing.id,
    metadata: { status },
  });

  return prisma.membership.findUniqueOrThrow({
    where: { id: existing.id },
    include: { plan: true, periods: true, freezes: true },
  });
}

export async function assertActiveMembership(opts: {
  tenantId: string;
  customerId: string;
  required?: boolean;
}) {
  const membership = await prisma.membership.findFirst({
    where: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      status: "active",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    include: { plan: true },
  });
  if (opts.required && !membership) {
    throw httpError("Active membership required", "membership_required", 403);
  }
  return membership;
}

export async function createClassSession(opts: {
  tenantId: string;
  classId: string;
  startsAt: Date;
  endsAt?: Date;
  capacity?: number;
  areaId?: string | null;
  trainerId?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const fitnessClass = await prisma.fitnessClass.findFirst({
    where: { id: opts.classId, tenantId: opts.tenantId },
  });
  if (!fitnessClass) throw httpError("Class not found", "not_found", 404);

  const endsAt =
    opts.endsAt ??
    new Date(opts.startsAt.getTime() + fitnessClass.durationMinutes * 60000);
  const capacity = opts.capacity ?? fitnessClass.capacity;

  const category = await ensureFitnessCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "fitness_classes",
      name: `${fitnessClass.name} @ ${opts.startsAt.toISOString()}`,
      code: `CLS-${fitnessClass.code}-${Date.now().toString(36)}`,
      capacity,
      status: "available",
      tags: ["class", "fitness"],
      metadata: { classId: fitnessClass.id },
      customFields: {},
      sourceType: "class_session",
      sourceId: `pending_${Date.now()}`,
    },
  });

  const session = await prisma.classSession.create({
    data: {
      tenantId: opts.tenantId,
      classId: fitnessClass.id,
      areaId: opts.areaId ?? fitnessClass.areaId,
      trainerId: opts.trainerId ?? null,
      bookableResourceId: resource.id,
      startsAt: opts.startsAt,
      endsAt,
      capacity,
      status: "scheduled",
    },
  });

  await prisma.bookableResource.update({
    where: { id: resource.id },
    data: { sourceId: session.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "class_session.created",
    resource: "class_session",
    resourceId: session.id,
    metadata: { bookableResourceId: resource.id },
  });

  return session;
}

export async function bookClassSession(opts: {
  tenantId: string;
  sessionId: string;
  customerId: string;
  joinWaitlistIfUnavailable?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  const session = await prisma.classSession.findFirst({
    where: { id: opts.sessionId, tenantId: opts.tenantId },
    include: { fitnessClass: true },
  });
  if (!session) throw httpError("Class session not found", "not_found", 404);
  if (!session.bookableResourceId) {
    throw httpError("Session has no bookable resource", "no_resources", 409);
  }

  if (session.fitnessClass.membershipRequired) {
    await assertActiveMembership({
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      required: true,
    });
  }

  try {
    const booking = await createBooking({
      tenantId: opts.tenantId,
      moduleId: "fitness_classes",
      customerId: opts.customerId,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      partySize: 1,
      status: "confirmed",
      items: [{ resourceId: session.bookableResourceId, quantity: 1 }],
      actorKind: opts.actorKind,
      actorId: opts.actorId,
      allowWaitlistFallback: opts.joinWaitlistIfUnavailable ?? true,
    });

    const classBooking = await prisma.classBooking.create({
      data: {
        tenantId: opts.tenantId,
        sessionId: session.id,
        customerId: opts.customerId,
        bookingId: booking.id,
        status: "confirmed",
      },
    });

    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: opts.customerId,
      title: "Class booked",
      body: `You are booked for ${session.fitnessClass.name}.`,
      metadata: { sessionId: session.id, bookingId: booking.id },
    });

    await writeAudit({
      tenantId: opts.tenantId,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
      action: "class_booking.created",
      resource: "class_booking",
      resourceId: classBooking.id,
    });

    return { classBooking, booking };
  } catch (err) {
    const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
    if (e.code === "waitlisted") throw e;
    throw e;
  }
}

export async function bookPersonalTraining(opts: {
  tenantId: string;
  trainerId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const trainer = await prisma.trainer.findFirst({
    where: { id: opts.trainerId, tenantId: opts.tenantId, status: "active" },
  });
  if (!trainer) throw httpError("Trainer not found", "not_found", 404);

  let resourceId = trainer.bookableResourceId;
  if (!resourceId) {
    const category = await ensureFitnessCategory(opts.tenantId);
    const resource = await prisma.bookableResource.create({
      data: {
        tenantId: opts.tenantId,
        categoryId: category.id,
        moduleId: "gym_membership",
        name: `Trainer: ${trainer.displayName}`,
        code: `TRN-${trainer.id.slice(-8)}`,
        capacity: 1,
        status: "available",
        tags: ["trainer", "pt"],
        metadata: { trainerId: trainer.id },
        customFields: {},
        sourceType: "trainer",
        sourceId: trainer.id,
      },
    });
    resourceId = resource.id;
    await prisma.trainer.update({
      where: { id: trainer.id },
      data: { bookableResourceId: resourceId },
    });
  }

  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "service",
    name: `PT with ${trainer.displayName}`,
    code: `PT-${Date.now().toString(36)}`,
    basePrice: 60,
    status: "active",
    visibility: "public",
    moduleId: "gym_membership",
    durationMinutes: Math.round((opts.endsAt.getTime() - opts.startsAt.getTime()) / 60000),
    bookable: true,
    bookableResourceIds: [resourceId],
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  }).catch(() => null);

  const booking = await createBooking({
    tenantId: opts.tenantId,
    moduleId: "gym_membership",
    customerId: opts.customerId,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    notes: opts.notes,
    status: "confirmed",
    items: [{ resourceId, quantity: 1 }],
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const session = await prisma.trainingSession.create({
    data: {
      tenantId: opts.tenantId,
      trainerId: trainer.id,
      customerId: opts.customerId,
      offeringId: offering?.id ?? null,
      bookingId: booking.id,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      notes: opts.notes ?? null,
      status: "confirmed",
    },
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: opts.customerId,
    title: "Personal training booked",
    body: `Session with ${trainer.displayName} confirmed.`,
    metadata: { trainingSessionId: session.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "training_session.created",
    resource: "training_session",
    resourceId: session.id,
  });

  return { session, booking };
}

export async function recordAttendance(opts: {
  tenantId: string;
  customerId: string;
  sessionId?: string | null;
  trainingId?: string | null;
  kind?: string;
  status?: string;
  location?: string | null;
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const attendance = await prisma.attendance.create({
    data: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      sessionId: opts.sessionId ?? null,
      trainingId: opts.trainingId ?? null,
      kind: opts.kind ?? "class",
      status: opts.status ?? "present",
      location: opts.location ?? null,
      notes: opts.notes ?? null,
    },
  });

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: opts.customerId,
    title: "Attendance confirmation",
    body: `Attendance recorded: ${attendance.status}.`,
    metadata: { attendanceId: attendance.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "attendance.recorded",
    resource: "attendance",
    resourceId: attendance.id,
  });

  return attendance;
}

export async function checkIn(opts: {
  tenantId: string;
  customerId: string;
  facilityId?: string | null;
  areaId?: string | null;
  kind?: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const checkIn = await prisma.fitnessCheckIn.create({
    data: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      facilityId: opts.facilityId ?? null,
      areaId: opts.areaId ?? null,
      kind: opts.kind ?? "gym",
      source: opts.actorKind,
      metadata: {},
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "fitness_checkin.created",
    resource: "fitness_checkin",
    resourceId: checkIn.id,
  });

  return checkIn;
}

export async function createAccessPass(opts: {
  tenantId: string;
  customerId?: string | null;
  kind: string;
  startsAt: Date;
  expiresAt: Date;
  allowedAreas?: string[];
  notes?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "product",
    name: `${opts.kind.replace(/_/g, " ")}`,
    code: `PASS-${Date.now().toString(36)}`,
    basePrice: opts.kind === "day_pass" ? 25 : 15,
    status: "active",
    visibility: "public",
    moduleId: "gym_membership",
    sku: opts.kind,
    unit: "pass",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const pass = await prisma.accessPass.create({
    data: {
      tenantId: opts.tenantId,
      customerId: opts.customerId ?? null,
      kind: opts.kind,
      offeringId: offering.id,
      startsAt: opts.startsAt,
      expiresAt: opts.expiresAt,
      allowedAreas: opts.allowedAreas ?? [],
      notes: opts.notes ?? null,
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "access_pass.created",
    resource: "access_pass",
    resourceId: pass.id,
    metadata: { offeringId: offering.id },
  });

  return pass;
}

export async function cancelClassBooking(opts: {
  tenantId: string;
  classBookingId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const booking = await prisma.classBooking.findFirst({
    where: { id: opts.classBookingId, tenantId: opts.tenantId },
  });
  if (!booking) throw httpError("Class booking not found", "not_found", 404);

  await prisma.classBooking.update({
    where: { id: booking.id },
    data: { status: "cancelled" },
  });

  if (booking.bookingId) {
    await cancelBooking({
      tenantId: opts.tenantId,
      bookingId: booking.bookingId,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "class_booking.cancelled",
    resource: "class_booking",
    resourceId: booking.id,
  });

  return booking;
}
