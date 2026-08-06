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

async function ensureSpaCategory(tenantId: string) {
  await ensureDefaultCategories(tenantId);
  return prisma.resourceCategory.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "wellness" } },
  });
}

export async function createTreatment(opts: {
  tenantId: string;
  facilityId?: string | null;
  categoryId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  durationMinutes?: number;
  price?: number;
  requiredRoomTypes?: string[];
  requiredSpecialties?: string[];
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "service",
    name: opts.name,
    code: `SPA-${opts.code}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "spa_services",
    durationMinutes: opts.durationMinutes ?? 60,
    bookable: true,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const treatment = await prisma.treatment.create({
    data: {
      tenantId: opts.tenantId,
      facilityId: opts.facilityId ?? null,
      categoryId: opts.categoryId ?? null,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      durationMinutes: opts.durationMinutes ?? 60,
      price: opts.price ?? 0,
      requiredRoomTypes: opts.requiredRoomTypes ?? [],
      requiredSpecialties: opts.requiredSpecialties ?? [],
      imageUrls: [],
      metadata: {},
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "treatment.created",
    resource: "treatment",
    resourceId: treatment.id,
    metadata: { offeringId: offering.id },
  });

  return treatment;
}

export async function createTreatmentVariant(opts: {
  tenantId: string;
  treatmentId: string;
  name: string;
  code: string;
  durationMinutes: number;
  price?: number;
  actorKind: string;
  actorId?: string | null;
}) {
  const treatment = await prisma.treatment.findFirst({
    where: { id: opts.treatmentId, tenantId: opts.tenantId },
  });
  if (!treatment) throw httpError("Treatment not found", "not_found", 404);

  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "service",
    name: `${treatment.name} — ${opts.name}`,
    code: `SPA-V-${opts.code}-${Date.now().toString(36)}`,
    basePrice: opts.price ?? treatment.price,
    status: "active",
    visibility: "public",
    moduleId: "spa_services",
    durationMinutes: opts.durationMinutes,
    bookable: true,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const variant = await prisma.treatmentVariant.create({
    data: {
      tenantId: opts.tenantId,
      treatmentId: treatment.id,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      durationMinutes: opts.durationMinutes,
      price: opts.price ?? treatment.price,
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "treatment_variant.created",
    resource: "treatment_variant",
    resourceId: variant.id,
  });

  return variant;
}

export async function ensureTherapistResource(opts: {
  tenantId: string;
  therapistId: string;
}) {
  const therapist = await prisma.spaTherapist.findFirst({
    where: { id: opts.therapistId, tenantId: opts.tenantId },
  });
  if (!therapist) throw httpError("Therapist not found", "not_found", 404);
  if (therapist.bookableResourceId) return therapist.bookableResourceId;

  const category = await ensureSpaCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "spa_services",
      name: `Therapist: ${therapist.displayName}`,
      code: `SPT-${therapist.id.slice(-8)}`,
      capacity: 1,
      status: "available",
      tags: ["therapist", "spa"],
      metadata: { therapistId: therapist.id },
      customFields: {},
      sourceType: "spa_therapist",
      sourceId: therapist.id,
    },
  });
  await prisma.spaTherapist.update({
    where: { id: therapist.id },
    data: { bookableResourceId: resource.id },
  });
  return resource.id;
}

export async function ensureRoomResource(opts: {
  tenantId: string;
  roomId: string;
}) {
  const room = await prisma.treatmentRoom.findFirst({
    where: { id: opts.roomId, tenantId: opts.tenantId },
  });
  if (!room) throw httpError("Room not found", "not_found", 404);
  if (room.status === "maintenance" || room.status === "out_of_service") {
    throw httpError("Room unavailable", "room_unavailable", 409);
  }
  if (room.bookableResourceId) return room.bookableResourceId;

  const category = await ensureSpaCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "spa_services",
      name: `Room: ${room.name}`,
      code: `SPR-${room.id.slice(-8)}`,
      capacity: room.capacity,
      status: "available",
      tags: ["room", "spa", room.roomType],
      metadata: { roomId: room.id, roomType: room.roomType },
      customFields: {},
      sourceType: "treatment_room",
      sourceId: room.id,
    },
  });
  await prisma.treatmentRoom.update({
    where: { id: room.id },
    data: { bookableResourceId: resource.id },
  });
  return resource.id;
}

export async function ensureWellnessAreaResource(opts: {
  tenantId: string;
  areaId: string;
}) {
  const area = await prisma.wellnessArea.findFirst({
    where: { id: opts.areaId, tenantId: opts.tenantId },
  });
  if (!area) throw httpError("Wellness area not found", "not_found", 404);
  if (area.bookableResourceId) return area.bookableResourceId;

  const category = await ensureSpaCategory(opts.tenantId);
  const resource = await prisma.bookableResource.create({
    data: {
      tenantId: opts.tenantId,
      categoryId: category.id,
      moduleId: "spa_services",
      name: `Facility: ${area.name}`,
      code: `SPW-${area.id.slice(-8)}`,
      capacity: area.capacity ?? 10,
      status: "available",
      tags: ["wellness", area.areaType],
      metadata: { areaId: area.id },
      customFields: {},
      sourceType: "wellness_area",
      sourceId: area.id,
    },
  });
  await prisma.wellnessArea.update({
    where: { id: area.id },
    data: { bookableResourceId: resource.id },
  });
  return resource.id;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

export async function bookSpaAppointment(opts: {
  tenantId: string;
  customerId: string;
  treatmentId: string;
  variantId?: string | null;
  therapistId?: string | null;
  roomId?: string | null;
  startsAt: Date;
  endsAt?: Date;
  notes?: string | null;
  addonOfferingIds?: string[];
  joinWaitlistIfUnavailable?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  const treatment = await prisma.treatment.findFirst({
    where: { id: opts.treatmentId, tenantId: opts.tenantId, status: "active" },
  });
  if (!treatment) throw httpError("Treatment not found", "not_found", 404);

  let duration = treatment.durationMinutes;
  let variantId: string | null = opts.variantId ?? null;
  if (variantId) {
    const variant = await prisma.treatmentVariant.findFirst({
      where: { id: variantId, treatmentId: treatment.id, tenantId: opts.tenantId },
    });
    if (!variant) throw httpError("Variant not found", "not_found", 404);
    duration = variant.durationMinutes;
  }

  const endsAt = opts.endsAt ?? new Date(opts.startsAt.getTime() + duration * 60000);
  const items: Array<{ resourceId: string; quantity: number }> = [];

  if (opts.therapistId) {
    const therapist = await prisma.spaTherapist.findFirst({
      where: { id: opts.therapistId, tenantId: opts.tenantId, status: "active" },
      include: { specialties: true, treatments: true },
    });
    if (!therapist) throw httpError("Therapist not found", "not_found", 404);

    const required = asStringArray(treatment.requiredSpecialties);
    if (required.length > 0) {
      const codes = therapist.specialties.map((s) => s.code);
      const ok = required.every((r) => codes.includes(r));
      if (!ok) throw httpError("Therapist specialty mismatch", "specialty_conflict", 409);
    }

    const linked = therapist.treatments.some(
      (t) => t.treatmentId === treatment.id && t.status === "active",
    );
    if (therapist.treatments.length > 0 && !linked) {
      throw httpError("Therapist not assigned to this treatment", "treatment_assignment", 409);
    }

    const rid = await ensureTherapistResource({
      tenantId: opts.tenantId,
      therapistId: therapist.id,
    });
    items.push({ resourceId: rid, quantity: 1 });
  }

  if (opts.roomId) {
    const room = await prisma.treatmentRoom.findFirst({
      where: { id: opts.roomId, tenantId: opts.tenantId },
    });
    if (!room) throw httpError("Room not found", "not_found", 404);
    const requiredRooms = asStringArray(treatment.requiredRoomTypes);
    if (requiredRooms.length > 0 && !requiredRooms.includes(room.roomType)) {
      throw httpError("Room incompatible with treatment", "room_incompatible", 409);
    }
    const rid = await ensureRoomResource({ tenantId: opts.tenantId, roomId: room.id });
    items.push({ resourceId: rid, quantity: 1 });
  }

  if (items.length === 0) {
    // Book against a synthetic treatment slot resource so Booking Engine still owns capacity.
    const category = await ensureSpaCategory(opts.tenantId);
    const resource = await prisma.bookableResource.create({
      data: {
        tenantId: opts.tenantId,
        categoryId: category.id,
        moduleId: "spa_services",
        name: `Treatment: ${treatment.name}`,
        code: `SPX-${Date.now().toString(36)}`,
        capacity: 20,
        status: "available",
        tags: ["treatment", "spa"],
        metadata: { treatmentId: treatment.id },
        customFields: {},
        sourceType: "spa_treatment_slot",
        sourceId: treatment.id,
      },
    });
    items.push({ resourceId: resource.id, quantity: 1 });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: opts.customerId, tenantId: opts.tenantId },
  });
  if (!customer) throw httpError("Client not found", "not_found", 404);

  await prisma.spaClientProfile.upsert({
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

  try {
    const booking = await createBooking({
      tenantId: opts.tenantId,
      moduleId: "spa_services",
      customerId: opts.customerId,
      startsAt: opts.startsAt,
      endsAt,
      notes: opts.notes,
      status: "confirmed",
      items,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
      allowWaitlistFallback: opts.joinWaitlistIfUnavailable ?? true,
    });

    const appointment = await prisma.spaAppointment.create({
      data: {
        tenantId: opts.tenantId,
        customerId: opts.customerId,
        treatmentId: treatment.id,
        variantId,
        therapistId: opts.therapistId ?? null,
        roomId: opts.roomId ?? null,
        bookingId: booking.id,
        startsAt: opts.startsAt,
        endsAt,
        status: "confirmed",
        notes: opts.notes ?? null,
        addonOfferingIds: opts.addonOfferingIds ?? [],
      },
      include: { treatment: true, therapist: true, room: true, variant: true },
    });

    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: opts.customerId,
      title: "Appointment confirmed",
      body: `Your ${treatment.name} appointment is confirmed.`,
      metadata: { appointmentId: appointment.id, bookingId: booking.id },
    });

    await writeAudit({
      tenantId: opts.tenantId,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
      action: "spa_appointment.created",
      resource: "spa_appointment",
      resourceId: appointment.id,
      metadata: { bookingId: booking.id },
    });

    return { appointment, booking };
  } catch (err) {
    const e = err as Error & { code?: string; statusCode?: number; waitlistEntry?: unknown };
    if (e.code === "waitlisted") throw e;
    throw e;
  }
}

export async function cancelSpaAppointment(opts: {
  tenantId: string;
  appointmentId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.spaAppointment.findFirst({
    where: { id: opts.appointmentId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Appointment not found", "not_found", 404);

  await prisma.spaAppointment.update({
    where: { id: existing.id },
    data: { status: "cancelled" },
  });

  if (existing.bookingId) {
    await cancelBooking({
      tenantId: opts.tenantId,
      bookingId: existing.bookingId,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    }).catch(() => undefined);
  }

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: existing.customerId,
    title: "Appointment cancelled",
    body: "Your spa appointment was cancelled.",
    metadata: { appointmentId: existing.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "spa_appointment.cancelled",
    resource: "spa_appointment",
    resourceId: existing.id,
  });

  return prisma.spaAppointment.findUniqueOrThrow({ where: { id: existing.id } });
}

export async function completeSpaAppointment(opts: {
  tenantId: string;
  appointmentId: string;
  generalNotes?: string | null;
  aftercareInstructions?: string | null;
  therapistId?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.spaAppointment.findFirst({
    where: { id: opts.appointmentId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Appointment not found", "not_found", 404);

  await prisma.spaAppointment.update({
    where: { id: existing.id },
    data: { status: "completed" },
  });

  const note = await prisma.treatmentNote.create({
    data: {
      tenantId: opts.tenantId,
      appointmentId: existing.id,
      therapistId: opts.therapistId ?? existing.therapistId,
      treatmentId: existing.treatmentId,
      completionStatus: "completed",
      generalNotes: opts.generalNotes ?? null,
      createdByStaffId: opts.actorKind === "staff" ? opts.actorId ?? null : null,
    },
  });

  let aftercare = null;
  if (opts.aftercareInstructions) {
    aftercare = await prisma.aftercareNote.create({
      data: {
        tenantId: opts.tenantId,
        appointmentId: existing.id,
        customerId: existing.customerId,
        instructions: opts.aftercareInstructions,
        visibleToGuest: true,
      },
    });
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "guest",
      actorId: existing.customerId,
      title: "Aftercare available",
      body: "Aftercare instructions for your recent treatment are ready.",
      metadata: { appointmentId: existing.id },
    });
  }

  await createNotification({
    tenantId: opts.tenantId,
    actorKind: "guest",
    actorId: existing.customerId,
    title: "Treatment completed",
    body: "Your spa treatment was marked complete.",
    metadata: { appointmentId: existing.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "spa_appointment.completed",
    resource: "spa_appointment",
    resourceId: existing.id,
    metadata: { treatmentNoteId: note.id },
  });

  return { appointmentId: existing.id, note, aftercare };
}

export async function bookWellnessFacility(opts: {
  tenantId: string;
  areaId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  partySize?: number;
  actorKind: string;
  actorId?: string | null;
}) {
  const area = await prisma.wellnessArea.findFirst({
    where: { id: opts.areaId, tenantId: opts.tenantId, status: "active" },
  });
  if (!area) throw httpError("Wellness area not found", "not_found", 404);

  const resourceId = await ensureWellnessAreaResource({
    tenantId: opts.tenantId,
    areaId: area.id,
  });

  const booking = await createBooking({
    tenantId: opts.tenantId,
    moduleId: "spa_services",
    customerId: opts.customerId,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    partySize: opts.partySize ?? 1,
    status: "confirmed",
    items: [{ resourceId, quantity: opts.partySize ?? 1 }],
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const session = await prisma.wellnessFacilitySession.create({
    data: {
      tenantId: opts.tenantId,
      areaId: area.id,
      customerId: opts.customerId,
      bookingId: booking.id,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      partySize: opts.partySize ?? 1,
      status: "confirmed",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "wellness_session.created",
    resource: "wellness_facility_session",
    resourceId: session.id,
  });

  return { session, booking };
}

export async function createSpaMembershipPlan(opts: {
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  durationDays?: number;
  price?: number;
  benefits?: unknown[];
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "product",
    name: opts.name,
    code: `SPA-MEM-${opts.code}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "spa_services",
    sku: opts.code,
    unit: "membership",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const plan = await prisma.spaMembershipPlan.create({
    data: {
      tenantId: opts.tenantId,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      durationDays: opts.durationDays ?? 30,
      price: opts.price ?? 0,
      benefits: (opts.benefits ?? []) as object,
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "spa_membership_plan.created",
    resource: "spa_membership_plan",
    resourceId: plan.id,
  });

  return plan;
}

export async function activateSpaMembership(opts: {
  tenantId: string;
  planId: string;
  customerId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const plan = await prisma.spaMembershipPlan.findFirst({
    where: { id: opts.planId, tenantId: opts.tenantId, status: "active" },
  });
  if (!plan) throw httpError("Membership plan not found", "not_found", 404);

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86400000);
  const membership = await prisma.spaMembership.create({
    data: {
      tenantId: opts.tenantId,
      planId: plan.id,
      customerId: opts.customerId,
      status: "active",
      startsAt,
      endsAt,
    },
    include: { plan: true },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "spa_membership.activated",
    resource: "spa_membership",
    resourceId: membership.id,
  });

  return membership;
}

export async function createSpaPackage(opts: {
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  price?: number;
  items?: unknown[];
  actorKind: string;
  actorId?: string | null;
}) {
  await ensureDefaultCatalog(opts.tenantId);
  const offering = await createOffering({
    tenantId: opts.tenantId,
    kind: "package",
    name: opts.name,
    code: `SPA-PKG-${opts.code}`,
    description: opts.description,
    basePrice: opts.price ?? 0,
    bundlePrice: opts.price ?? 0,
    status: "active",
    visibility: "public",
    moduleId: "spa_services",
    actorKind: opts.actorKind,
    actorId: opts.actorId,
  });

  const pkg = await prisma.spaPackage.create({
    data: {
      tenantId: opts.tenantId,
      offeringId: offering.id,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      price: opts.price ?? 0,
      items: (opts.items ?? []) as object,
      status: "active",
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "spa_package.created",
    resource: "spa_package",
    resourceId: pkg.id,
  });

  return pkg;
}
