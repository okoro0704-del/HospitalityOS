import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

const NOTE_READ_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "crm_manager",
  "front_desk",
  "reception",
]);

export function canReadInternalNotes(role?: string | null) {
  return !!role && NOTE_READ_ROLES.has(role);
}

export async function recordCustomerEvent(opts: {
  tenantId: string;
  customerId: string;
  eventType: string;
  sourceModule: string;
  sourceEntityId?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  return prisma.customerEvent.create({
    data: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      eventType: opts.eventType,
      sourceModule: opts.sourceModule,
      sourceEntityId: opts.sourceEntityId ?? null,
      title: opts.title ?? null,
      metadata: opts.metadata ?? {},
      occurredAt: opts.occurredAt ?? new Date(),
    },
  });
}

/** Vertical timeline providers — reference existing records, do not duplicate. */
export async function collectVerticalTimeline(opts: {
  tenantId: string;
  customerId: string;
}) {
  const [bookings, stays, dining, memberships, spaAppts, eventTickets, cinemaTickets, stored] =
    await Promise.all([
      prisma.booking.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        orderBy: { startsAt: "desc" },
        take: 50,
      }),
      prisma.stay.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.diningReservation.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        orderBy: { seatingAt: "desc" },
        take: 50,
      }),
      prisma.membership.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.spaAppointment.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.eventTicket.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        include: { event: true },
        orderBy: { bookedAt: "desc" },
        take: 50,
      }),
      prisma.cinemaTicket.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        include: { showtime: { include: { content: true } } },
        orderBy: { bookedAt: "desc" },
        take: 50,
      }),
      prisma.customerEvent.findMany({
        where: { tenantId: opts.tenantId, customerId: opts.customerId },
        orderBy: { occurredAt: "desc" },
        take: 100,
      }),
    ]);

  type TimelineItem = {
    id: string;
    eventType: string;
    sourceModule: string;
    sourceEntityId: string | null;
    title: string;
    occurredAt: string;
    metadata: Record<string, unknown>;
  };

  const items: TimelineItem[] = [];

  for (const b of bookings) {
    items.push({
      id: `booking:${b.id}`,
      eventType: b.status === "cancelled" ? "BOOKING_CANCELLED" : "BOOKING_CREATED",
      sourceModule: b.moduleId ?? "booking",
      sourceEntityId: b.id,
      title: `Booking ${b.status}`,
      occurredAt: b.startsAt.toISOString(),
      metadata: { status: b.status },
    });
  }
  for (const s of stays) {
    items.push({
      id: `stay:${s.id}`,
      eventType: "STAY_COMPLETED",
      sourceModule: "accommodation",
      sourceEntityId: s.id,
      title: "Stay",
      occurredAt: s.createdAt.toISOString(),
      metadata: {},
    });
  }
  for (const d of dining) {
    items.push({
      id: `dining:${d.id}`,
      eventType: "BOOKING_CREATED",
      sourceModule: "restaurant",
      sourceEntityId: d.id,
      title: `Dining reservation (${d.status})`,
      occurredAt: d.seatingAt.toISOString(),
      metadata: { status: d.status },
    });
  }
  for (const m of memberships) {
    items.push({
      id: `membership:${m.id}`,
      eventType: "MEMBERSHIP_STARTED",
      sourceModule: "gym_membership",
      sourceEntityId: m.id,
      title: `Membership ${m.status}`,
      occurredAt: m.createdAt.toISOString(),
      metadata: { status: m.status },
    });
  }
  for (const a of spaAppts) {
    items.push({
      id: `spa:${a.id}`,
      eventType: "SPA_APPOINTMENT_COMPLETED",
      sourceModule: "spa_services",
      sourceEntityId: a.id,
      title: `Spa appointment (${a.status})`,
      occurredAt: a.createdAt.toISOString(),
      metadata: { status: a.status },
    });
  }
  for (const t of eventTickets) {
    items.push({
      id: `event-ticket:${t.id}`,
      eventType: "EVENT_ATTENDED",
      sourceModule: "events",
      sourceEntityId: t.id,
      title: t.event?.name ?? "Event ticket",
      occurredAt: t.bookedAt.toISOString(),
      metadata: { status: t.status },
    });
  }
  for (const t of cinemaTickets) {
    items.push({
      id: `cinema-ticket:${t.id}`,
      eventType: "CINEMA_TICKET_USED",
      sourceModule: "cinema",
      sourceEntityId: t.id,
      title: t.showtime?.content?.title ?? "Cinema ticket",
      occurredAt: t.bookedAt.toISOString(),
      metadata: { status: t.status },
    });
  }
  for (const e of stored) {
    items.push({
      id: e.id,
      eventType: e.eventType,
      sourceModule: e.sourceModule,
      sourceEntityId: e.sourceEntityId,
      title: e.title ?? e.eventType,
      occurredAt: e.occurredAt.toISOString(),
      metadata: (e.metadata as Record<string, unknown>) ?? {},
    });
  }

  items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return items;
}

export async function searchCustomers(opts: {
  tenantId: string;
  q?: string;
  tagCode?: string;
  limit?: number;
}) {
  const q = opts.q?.trim();
  const where: {
    tenantId: string;
    OR?: Array<Record<string, unknown>>;
    crmTagLinks?: { some: { tag: { code: string } } };
  } = { tenantId: opts.tenantId };

  if (q) {
    where.OR = [
      { displayName: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { id: q },
      { externalIdentityRef: q },
      { trustId: q },
      { lifeosUserId: q },
    ];
  }
  if (opts.tagCode) {
    where.crmTagLinks = { some: { tag: { code: opts.tagCode } } };
  }

  return prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: opts.limit ?? 50,
    include: {
      crmTagLinks: { include: { tag: true } },
      crmLoyalty: true,
    },
  });
}

export async function updateCustomerProfile(opts: {
  tenantId: string;
  customerId: string;
  data: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    preferredName?: string | null;
    email?: string | null;
    phone?: string | null;
    preferredLanguage?: string | null;
    timezone?: string | null;
    externalIdentityRef?: string | null;
    trustId?: string | null;
    status?: string;
    preferences?: Record<string, unknown>;
  };
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.customer.findFirst({
    where: { id: opts.customerId, tenantId: opts.tenantId },
  });
  if (!existing) throw httpError("Customer not found", "not_found", 404);

  const customer = await prisma.customer.update({
    where: { id: existing.id },
    data: {
      ...(opts.data.displayName !== undefined ? { displayName: opts.data.displayName } : {}),
      ...(opts.data.firstName !== undefined ? { firstName: opts.data.firstName } : {}),
      ...(opts.data.lastName !== undefined ? { lastName: opts.data.lastName } : {}),
      ...(opts.data.preferredName !== undefined ? { preferredName: opts.data.preferredName } : {}),
      ...(opts.data.email !== undefined ? { email: opts.data.email } : {}),
      ...(opts.data.phone !== undefined ? { phone: opts.data.phone } : {}),
      ...(opts.data.preferredLanguage !== undefined
        ? { preferredLanguage: opts.data.preferredLanguage }
        : {}),
      ...(opts.data.timezone !== undefined ? { timezone: opts.data.timezone } : {}),
      ...(opts.data.externalIdentityRef !== undefined
        ? { externalIdentityRef: opts.data.externalIdentityRef }
        : {}),
      ...(opts.data.trustId !== undefined ? { trustId: opts.data.trustId } : {}),
      ...(opts.data.status !== undefined ? { status: opts.data.status } : {}),
      ...(opts.data.preferences !== undefined ? { preferences: opts.data.preferences } : {}),
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "customer.updated",
    resource: "customer",
    resourceId: customer.id,
  });

  return customer;
}

export async function setCustomerPreference(opts: {
  tenantId: string;
  customerId: string;
  moduleId?: string | null;
  key: string;
  value: unknown;
  actorKind: string;
  actorId?: string | null;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: opts.customerId, tenantId: opts.tenantId },
  });
  if (!customer) throw httpError("Customer not found", "not_found", 404);

  const pref = await prisma.customerPreference.upsert({
    where: {
      customerId_moduleId_key: {
        customerId: customer.id,
        moduleId: opts.moduleId ?? "",
        key: opts.key,
      },
    },
    create: {
      tenantId: opts.tenantId,
      customerId: customer.id,
      moduleId: opts.moduleId ?? "",
      key: opts.key,
      value: opts.value as object,
    },
    update: { value: opts.value as object },
  });

  // also mirror into Customer.preferences bag for simple clients
  const bag = { ...((customer.preferences as Record<string, unknown>) ?? {}) };
  bag[opts.key] = opts.value;
  await prisma.customer.update({
    where: { id: customer.id },
    data: { preferences: bag },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "customer.preference.updated",
    resource: "customer_preference",
    resourceId: pref.id,
  });

  return pref;
}

export async function evaluateSegment(opts: {
  tenantId: string;
  segmentId: string;
}) {
  const segment = await prisma.customerSegment.findFirst({
    where: { id: opts.segmentId, tenantId: opts.tenantId },
  });
  if (!segment) throw httpError("Segment not found", "not_found", 404);

  const rules = (segment.rules ?? {}) as {
    minBookings?: number;
    tagCode?: string;
    membershipStatus?: string;
    lastVisitDays?: number;
  };

  let customers = await prisma.customer.findMany({
    where: { tenantId: opts.tenantId, status: "active" },
    include: {
      bookings: true,
      crmTagLinks: { include: { tag: true } },
      crmVisits: { orderBy: { visitedAt: "desc" }, take: 1 },
    },
  });

  if (rules.tagCode) {
    customers = customers.filter((c) =>
      c.crmTagLinks.some((l) => l.tag.code === rules.tagCode),
    );
  }
  if (rules.minBookings != null) {
    customers = customers.filter((c) => c.bookings.length >= (rules.minBookings ?? 0));
  }
  if (rules.lastVisitDays != null) {
    const cutoff = Date.now() - rules.lastVisitDays * 86400000;
    customers = customers.filter((c) => {
      const last = c.crmVisits[0]?.visitedAt?.getTime() ?? c.createdAt.getTime();
      return last >= cutoff;
    });
  }

  return { segment, customers };
}

/**
 * Customer merge — requires explicit confirmed=true.
 * UI should stay disabled until product enables it; service enforces confirmation.
 */
export async function mergeCustomers(opts: {
  tenantId: string;
  sourceCustomerId: string;
  destinationCustomerId: string;
  reason?: string | null;
  confirmed: boolean;
  actorId?: string | null;
  actorKind: string;
}) {
  if (!opts.confirmed) {
    throw httpError("Merge requires explicit confirmation", "merge_not_confirmed", 400);
  }
  if (opts.sourceCustomerId === opts.destinationCustomerId) {
    throw httpError("Cannot merge a customer into itself", "validation_error", 400);
  }

  const [source, dest] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: opts.sourceCustomerId, tenantId: opts.tenantId },
    }),
    prisma.customer.findFirst({
      where: { id: opts.destinationCustomerId, tenantId: opts.tenantId },
    }),
  ]);
  if (!source || !dest) throw httpError("Customer not found", "not_found", 404);

  const request = await prisma.customerMergeRequest.create({
    data: {
      tenantId: opts.tenantId,
      sourceCustomerId: source.id,
      destinationCustomerId: dest.id,
      reason: opts.reason ?? null,
      status: "completed",
      confirmed: true,
      actorId: opts.actorId ?? null,
      completedAt: new Date(),
    },
  });

  // Re-point CRM satellite records only (safe subset)
  await prisma.$transaction([
    prisma.customerContact.updateMany({
      where: { customerId: source.id },
      data: { customerId: dest.id },
    }),
    prisma.customerNote.updateMany({
      where: { customerId: source.id },
      data: { customerId: dest.id },
    }),
    prisma.customerTagLink.updateMany({
      where: { customerId: source.id },
      data: { customerId: dest.id },
    }),
    prisma.customerEvent.updateMany({
      where: { customerId: source.id },
      data: { customerId: dest.id },
    }),
    prisma.customerInteraction.updateMany({
      where: { customerId: source.id },
      data: { customerId: dest.id },
    }),
    prisma.customerFeedback.updateMany({
      where: { customerId: source.id },
      data: { customerId: dest.id },
    }),
    prisma.customer.update({
      where: { id: source.id },
      data: { status: "inactive", metadata: { mergedInto: dest.id, mergeRequestId: request.id } },
    }),
  ]);

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "customer.merged",
    resource: "customer_merge_request",
    resourceId: request.id,
    metadata: { sourceCustomerId: source.id, destinationCustomerId: dest.id },
  });

  return { request, destination: dest };
}

export async function ensureLoyaltyProfile(opts: {
  tenantId: string;
  customerId: string;
  enroll?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  const existing = await prisma.customerLoyaltyProfile.findUnique({
    where: { customerId: opts.customerId },
  });
  if (existing) return existing;

  const profile = await prisma.customerLoyaltyProfile.create({
    data: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      status: opts.enroll ? "enrolled" : "none",
      pointsBalance: 0,
      enrolledAt: opts.enroll ? new Date() : null,
      metadata: {},
    },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "customer.loyalty.created",
    resource: "customer_loyalty_profile",
    resourceId: profile.id,
  });

  return profile;
}
