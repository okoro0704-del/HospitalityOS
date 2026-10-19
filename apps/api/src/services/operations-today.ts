/**
 * Operations Today — permission-scoped read model over existing domains.
 * Does not duplicate domain records; aggregates with partial-failure isolation.
 */
import {
  staffHasPermission,
  type Permission,
} from "@hospitalityos/shared";
import { prisma } from "../db.js";
import type { StaffAuth } from "../lib/auth.js";
import { canAccessBranch, staffBranchIds } from "../lib/branch-scope.js";

export type AttentionPriority = "critical" | "high" | "normal" | "low";

export type TodayItem = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  href?: string | null;
  at?: string | null;
  meta?: Record<string, unknown>;
};

export type AttentionItem = {
  id: string;
  priority: AttentionPriority;
  title: string;
  reason: string;
  href?: string | null;
  source: string;
};

export type TodaySection = {
  id: string;
  title: string;
  ok: boolean;
  error?: string | null;
  items: TodayItem[];
  count: number;
};

export type QuickAction = {
  id: string;
  label: string;
  href: string;
  permission: Permission;
};

function dayBounds(day?: Date) {
  const start = new Date(day ?? new Date());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function has(auth: StaffAuth, permission: Permission) {
  return staffHasPermission(auth.role, permission) || auth.permissions?.includes(permission);
}

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Section unavailable";
    return { ok: false, error: message };
  }
}

function section(
  id: string,
  title: string,
  result: { ok: true; data: TodayItem[] } | { ok: false; error: string },
): TodaySection {
  if (!result.ok) {
    return { id, title, ok: false, error: result.error, items: [], count: 0 };
  }
  return { id, title, ok: true, error: null, items: result.data, count: result.data.length };
}

export function resolveBranchScope(auth: StaffAuth, requestedBranchId?: string | null) {
  if (requestedBranchId) {
    if (!canAccessBranch(auth, requestedBranchId)) {
      throw Object.assign(new Error("Branch access denied"), {
        code: "forbidden",
        statusCode: 403,
      });
    }
    return { branchId: requestedBranchId, mode: "single" as const };
  }
  const ids = staffBranchIds(auth);
  if (ids.length === 0) return { branchId: null, mode: "all" as const };
  if (ids.length === 1) return { branchId: ids[0]!, mode: "single" as const };
  return { branchId: null, mode: "authorized" as const, authorizedBranchIds: ids };
}

export async function getOperationsToday(opts: {
  tenantId: string;
  auth: StaffAuth;
  day?: Date;
  branchId?: string | null;
}) {
  const { start, end } = dayBounds(opts.day);
  const scope = resolveBranchScope(opts.auth, opts.branchId);
  const auth = opts.auth;
  const tenantId = opts.tenantId;
  const modules = await prisma.tenantModule.findMany({
    where: { tenantId, enabled: true },
    select: { moduleId: true },
  });
  const enabled = new Set(modules.map((m) => m.moduleId));

  const sections: TodaySection[] = [];
  const attention: AttentionItem[] = [];

  if (enabled.has("accommodation") && has(auth, "bookings.read")) {
    sections.push(
      section(
        "arrivals",
        "Arrivals",
        await safe(async () => {
          const rows = await prisma.accommodationReservation.findMany({
            where: {
              tenantId,
              checkInDate: { gte: start, lt: end },
              status: { in: ["confirmed", "checked_in", "pending"] },
              checkedInAt: null,
            },
            include: { customer: { select: { displayName: true } }, room: { select: { number: true } } },
            orderBy: { checkInDate: "asc" },
            take: 50,
          });
          return rows.map((r) => ({
            id: r.id,
            kind: "arrival",
            title: r.customer.displayName,
            subtitle: r.room?.number ? `Room ${r.room.number}` : r.confirmationCode,
            status: r.status,
            href: `/accommodation/reservations`,
            at: r.checkInDate.toISOString(),
          }));
        }),
      ),
    );
    sections.push(
      section(
        "departures",
        "Departures",
        await safe(async () => {
          const rows = await prisma.accommodationReservation.findMany({
            where: {
              tenantId,
              checkOutDate: { gte: start, lt: end },
              status: { in: ["checked_in", "confirmed"] },
              checkedOutAt: null,
            },
            include: { customer: { select: { displayName: true } }, room: { select: { number: true } } },
            orderBy: { checkOutDate: "asc" },
            take: 50,
          });
          return rows.map((r) => ({
            id: r.id,
            kind: "departure",
            title: r.customer.displayName,
            subtitle: r.room?.number ? `Room ${r.room.number}` : r.confirmationCode,
            status: r.status,
            href: `/accommodation/reservations`,
            at: r.checkOutDate.toISOString(),
          }));
        }),
      ),
    );

    const dirty = await safe(async () =>
      prisma.room.findMany({
        where: {
          tenantId,
          OR: [
            { housekeepingStatus: { in: ["dirty", "cleaning", "inspect"] } },
            { maintenanceStatus: { in: ["out_of_order", "maintenance"] } },
          ],
        },
        take: 30,
        orderBy: { number: "asc" },
      }),
    );
    if (dirty.ok) {
      for (const room of dirty.data) {
        if (room.maintenanceStatus === "out_of_order" || room.maintenanceStatus === "maintenance") {
          attention.push({
            id: `room_maint_${room.id}`,
            priority: "critical",
            title: `Room ${room.number} unavailable`,
            reason: `Maintenance: ${room.maintenanceStatus}`,
            href: `/accommodation/maintenance`,
            source: "accommodation",
          });
        } else {
          attention.push({
            id: `room_hk_${room.id}`,
            priority: "high",
            title: `Housekeeping — Room ${room.number}`,
            reason: room.housekeepingStatus,
            href: `/accommodation/housekeeping`,
            source: "accommodation",
          });
        }
      }
      sections.push({
        id: "housekeeping",
        title: "Room status issues",
        ok: true,
        items: dirty.data.map((r) => ({
          id: r.id,
          kind: "room",
          title: `Room ${r.number}`,
          subtitle: `${r.housekeepingStatus} / ${r.maintenanceStatus}`,
          status: r.housekeepingStatus,
          href: `/accommodation/rooms`,
        })),
        count: dirty.data.length,
      });
    }
  }

  if (has(auth, "bookings.read")) {
    sections.push(
      section(
        "bookings",
        "Today's bookings",
        await safe(async () => {
          const rows = await prisma.booking.findMany({
            where: {
              tenantId,
              startsAt: { gte: start, lt: end },
              status: { notIn: ["cancelled", "no_show"] },
            },
            orderBy: { startsAt: "asc" },
            take: 50,
          });
          return rows.map((b) => ({
            id: b.id,
            kind: "booking",
            title: b.confirmationCode,
            subtitle: b.moduleId,
            status: b.status,
            href: `/booking/bookings`,
            at: b.startsAt.toISOString(),
          }));
        }),
      ),
    );
  }

  if (enabled.has("restaurant") && has(auth, "bookings.read")) {
    sections.push(
      section(
        "dining_reservations",
        "Restaurant reservations",
        await safe(async () => {
          const rows = await prisma.diningReservation.findMany({
            where: {
              tenantId,
              seatingAt: { gte: start, lt: end },
              status: { notIn: ["cancelled"] },
            },
            orderBy: { seatingAt: "asc" },
            take: 50,
          });
          return rows.map((r) => ({
            id: r.id,
            kind: "dining_reservation",
            title: r.confirmationCode,
            subtitle: `Party ${r.partySize}`,
            status: r.status,
            href: `/dining/reservations`,
            at: r.seatingAt.toISOString(),
          }));
        }),
      ),
    );
  }
  if (enabled.has("restaurant") && has(auth, "orders.read")) {
    sections.push(
      section(
        "open_orders",
        "Open orders",
        await safe(async () => {
          const rows = await prisma.diningOrder.findMany({
            where: {
              tenantId,
              status: { in: ["open", "submitted", "in_kitchen", "ready"] },
            },
            orderBy: { createdAt: "desc" },
            take: 40,
          });
          return rows.map((o) => ({
            id: o.id,
            kind: "order",
            title: `Order ${o.id.slice(0, 8)}`,
            status: o.status,
            href: `/dining/orders`,
            at: o.createdAt.toISOString(),
          }));
        }),
      ),
    );
  }

  if (
    (enabled.has("gym_membership") || enabled.has("fitness_classes")) &&
    has(auth, "bookings.read")
  ) {
    sections.push(
      section(
        "fitness_classes",
        "Fitness classes",
        await safe(async () => {
          const rows = await prisma.classSession.findMany({
            where: {
              tenantId,
              startsAt: { gte: start, lt: end },
              status: { notIn: ["cancelled"] },
            },
            include: { fitnessClass: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 40,
          });
          return rows.map((s) => ({
            id: s.id,
            kind: "class_session",
            title: s.fitnessClass.name,
            subtitle: `Cap ${s.capacity}`,
            status: s.status,
            href: `/fitness/classes`,
            at: s.startsAt.toISOString(),
          }));
        }),
      ),
    );
  }

  if (
    (enabled.has("spa_services") || enabled.has("beauty_appointments")) &&
    has(auth, "bookings.read")
  ) {
    sections.push(
      section(
        "spa_appointments",
        "Spa appointments",
        await safe(async () => {
          const rows = await prisma.spaAppointment.findMany({
            where: {
              tenantId,
              startsAt: { gte: start, lt: end },
              status: { notIn: ["cancelled", "no_show"] },
            },
            include: { treatment: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 50,
          });
          return rows.map((a) => ({
            id: a.id,
            kind: "spa_appointment",
            title: a.treatment.name,
            status: a.status,
            href: `/spa/appointments`,
            at: a.startsAt.toISOString(),
          }));
        }),
      ),
    );
  }

  if ((enabled.has("events") || enabled.has("venue_booking")) && has(auth, "bookings.read")) {
    sections.push(
      section(
        "events",
        "Events today",
        await safe(async () => {
          const rows = await prisma.event.findMany({
            where: {
              tenantId,
              startsAt: { gte: start, lt: end },
              status: { in: ["published", "live", "sold_out"] },
            },
            orderBy: { startsAt: "asc" },
            take: 40,
          });
          return rows.map((e) => {
            if (e.soldCount >= Math.floor(e.capacity * 0.9)) {
              attention.push({
                id: `event_cap_${e.id}`,
                priority: "high",
                title: `${e.name} near capacity`,
                reason: `${e.soldCount}/${e.capacity} sold`,
                href: `/events/list`,
                source: "events",
              });
            }
            return {
              id: e.id,
              kind: "event",
              title: e.name,
              subtitle: `${e.soldCount}/${e.capacity}`,
              status: e.status,
              href: `/events/list`,
              at: e.startsAt.toISOString(),
            };
          });
        }),
      ),
    );
  }

  if (enabled.has("cinema") && has(auth, "bookings.read")) {
    sections.push(
      section(
        "showtimes",
        "Cinema showtimes",
        await safe(async () => {
          const rows = await prisma.cinemaShowtime.findMany({
            where: {
              tenantId,
              startsAt: { gte: start, lt: end },
              status: { in: ["published", "live", "sold_out"] },
            },
            include: { content: { select: { title: true } }, screen: { select: { name: true } } },
            orderBy: { startsAt: "asc" },
            take: 40,
          });
          return rows.map((s) => ({
            id: s.id,
            kind: "showtime",
            title: s.content.title,
            subtitle: s.screen.name,
            status: s.status,
            href: `/cinema/showtimes`,
            at: s.startsAt.toISOString(),
          }));
        }),
      ),
    );
  }

  if (enabled.has("inventory") && has(auth, "inventory.read")) {
    const alerts = await safe(async () =>
      prisma.reorderAlert.findMany({
        where: { tenantId, status: "open" },
        take: 40,
        orderBy: { createdAt: "desc" },
      }),
    );
    if (alerts.ok) {
      for (const a of alerts.data) {
        attention.push({
          id: `stock_${a.id}`,
          priority: a.onHand <= 0 ? "critical" : "high",
          title: "Low stock",
          reason: `On hand ${a.onHand} ≤ reorder ${a.reorderPoint}`,
          href: `/operations/alerts`,
          source: "inventory",
        });
      }
      sections.push({
        id: "low_stock",
        title: "Low-stock alerts",
        ok: true,
        items: alerts.data.map((a) => ({
          id: a.id,
          kind: "reorder_alert",
          title: `Item ${a.itemId.slice(0, 8)}`,
          subtitle: `${a.onHand} / ${a.reorderPoint}`,
          status: a.status,
          href: `/operations/alerts`,
        })),
        count: alerts.data.length,
      });
    }

    sections.push(
      section(
        "tasks",
        "Open tasks",
        await safe(async () => {
          const rows = await prisma.operationalTask.findMany({
            where: {
              tenantId,
              status: { in: ["open", "assigned", "in_progress"] },
            },
            orderBy: { dueAt: "asc" },
            take: 40,
          });
          const now = new Date();
          for (const t of rows) {
            if (t.dueAt && t.dueAt < now) {
              attention.push({
                id: `task_${t.id}`,
                priority: "high",
                title: `Overdue: ${t.title}`,
                reason: "Task past due",
                href: `/operations/tasks`,
                source: "operations",
              });
            }
          }
          return rows.map((t) => ({
            id: t.id,
            kind: "task",
            title: t.title,
            status: t.status,
            href: `/operations/tasks`,
            at: t.dueAt?.toISOString() ?? null,
          }));
        }),
      ),
    );

    sections.push(
      section(
        "maintenance",
        "Open maintenance",
        await safe(async () => {
          const rows = await prisma.maintenanceRecord.findMany({
            where: { tenantId, status: { in: ["open", "in_progress"] } },
            orderBy: { createdAt: "desc" },
            take: 40,
          });
          for (const m of rows.filter((r) => r.priority === "critical" || r.priority === "high")) {
            attention.push({
              id: `maint_${m.id}`,
              priority: m.priority === "critical" ? "critical" : "high",
              title: m.issue,
              reason: `Maintenance ${m.status}`,
              href: `/operations/maintenance`,
              source: "operations",
            });
          }
          return rows.map((m) => ({
            id: m.id,
            kind: "maintenance",
            title: m.issue,
            status: m.status,
            href: `/operations/maintenance`,
          }));
        }),
      ),
    );
  }

  if (has(auth, "payments.read") && enabled.has("billing")) {
    sections.push(
      section(
        "pending_payments",
        "Outstanding invoices",
        await safe(async () => {
          const rows = await prisma.invoice.findMany({
            where: {
              tenantId,
              status: { in: ["open", "partially_paid", "overdue"] },
              amountDue: { gt: 0 },
            },
            orderBy: { createdAt: "desc" },
            take: 40,
          });
          for (const inv of rows.filter((i) => i.status === "overdue")) {
            attention.push({
              id: `inv_${inv.id}`,
              priority: "high",
              title: `Overdue ${inv.number}`,
              reason: `Due ${inv.amountDue}`,
              href: `/billing/invoices?focus=${inv.id}`,
              source: "billing",
            });
          }
          return rows.map((inv) => ({
            id: inv.id,
            kind: "invoice",
            title: inv.number,
            subtitle: `${inv.amountDue} ${inv.currency}`,
            status: inv.status,
            href: `/billing/invoices?focus=${inv.id}`,
          }));
        }),
      ),
    );

    sections.push(
      section(
        "payment_verification",
        "Payments awaiting verification",
        await safe(async () => {
          const rows = await prisma.payment.findMany({
            where: {
              tenantId,
              status: "pending_verification",
              ...(scope.branchId ? { branchId: scope.branchId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 40,
          });
          for (const p of rows) {
            attention.push({
              id: `pay_verify_${p.id}`,
              priority: "high",
              title: "Payment verification pending",
              reason: `${p.amount} ${p.currency} · ${p.methodType}`,
              href: `/billing/payments?focus=${p.id}`,
              source: "billing",
            });
          }
          return rows.map((p) => ({
            id: p.id,
            kind: "payment",
            title: `${p.amount} ${p.currency}`,
            subtitle: p.methodType,
            status: p.status,
            href: `/billing/payments?focus=${p.id}`,
          }));
        }),
      ),
    );
  }

  if (has(auth, "notifications.manage") || has(auth, "bookings.read")) {
    sections.push(
      section(
        "notifications",
        "Operational notifications",
        await safe(async () => {
          const rows = await prisma.notification.findMany({
            where: {
              tenantId,
              audience: "staff",
              status: { in: ["unread", "delivered", "pending"] },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          });
          return rows.map((n) => ({
            id: n.id,
            kind: "notification",
            title: n.title,
            subtitle: n.body?.slice(0, 120) ?? null,
            status: n.status,
            href: `/notifications`,
            at: n.createdAt.toISOString(),
          }));
        }),
      ),
    );
  }

  const priorityOrder: Record<AttentionPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  attention.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    day: start.toISOString().slice(0, 10),
    branchScope: scope,
    sections,
    attention: attention.slice(0, 50),
    quickActions: buildQuickActions(auth, enabled),
    completed: {
      note: "Completed counts derived from today's captured payments and closed tasks where permitted.",
      paymentsCapturedToday: has(auth, "payments.read")
        ? await prisma.payment
            .count({
              where: {
                tenantId,
                status: { in: ["captured", "partially_refunded"] },
                capturedAt: { gte: start, lt: end },
              },
            })
            .catch(() => 0)
        : 0,
      tasksCompletedToday: has(auth, "inventory.read")
        ? await prisma.operationalTask
            .count({
              where: {
                tenantId,
                status: "completed",
                completedAt: { gte: start, lt: end },
              },
            })
            .catch(() => 0)
        : 0,
    },
  };
}

function buildQuickActions(auth: StaffAuth, enabled: Set<string>): QuickAction[] {
  const all: QuickAction[] = [
    { id: "create_customer", label: "Create customer", href: "/customers", permission: "customers.write" },
    { id: "create_booking", label: "Create booking", href: "/booking/bookings", permission: "bookings.write" },
    {
      id: "check_in",
      label: "Check in guest",
      href: "/accommodation/reservations",
      permission: "bookings.write",
    },
    {
      id: "collect_payment",
      label: "Collect payment",
      href: "/billing/invoices",
      permission: "payments.collect",
    },
    {
      id: "verify_payment",
      label: "Verify payment",
      href: "/billing/payments",
      permission: "payments.verify",
    },
    { id: "create_order", label: "Create order", href: "/dining/orders", permission: "orders.write" },
    {
      id: "create_reservation",
      label: "Dining reservation",
      href: "/dining/reservations",
      permission: "bookings.write",
    },
    { id: "attendance", label: "Check attendance", href: "/fitness/attendance", permission: "bookings.write" },
    { id: "spa_appt", label: "Spa appointments", href: "/spa/appointments", permission: "bookings.read" },
    { id: "event_checkin", label: "Event check-in", href: "/events/attendees", permission: "bookings.write" },
    { id: "cinema_checkin", label: "Cinema check-in", href: "/cinema/check-in", permission: "bookings.write" },
    { id: "create_task", label: "Create task", href: "/operations/tasks", permission: "inventory.adjust" },
    {
      id: "adjust_inventory",
      label: "Adjust inventory",
      href: "/operations/stock",
      permission: "inventory.adjust",
    },
    {
      id: "maintenance",
      label: "Open maintenance",
      href: "/operations/maintenance",
      permission: "inventory.adjust",
    },
  ];

  return all.filter((a) => {
    if (!has(auth, a.permission)) return false;
    if (a.href.startsWith("/accommodation") && !enabled.has("accommodation")) return false;
    if (a.href.startsWith("/dining") && !enabled.has("restaurant")) return false;
    if (a.href.startsWith("/fitness") && !enabled.has("gym_membership") && !enabled.has("fitness_classes"))
      return false;
    if (a.href.startsWith("/spa") && !enabled.has("spa_services") && !enabled.has("beauty_appointments"))
      return false;
    if (a.href.startsWith("/events") && !enabled.has("events")) return false;
    if (a.href.startsWith("/cinema") && !enabled.has("cinema")) return false;
    if (a.href.startsWith("/operations") && !enabled.has("inventory")) return false;
    if (a.href.startsWith("/billing") && !enabled.has("billing")) return false;
    return true;
  });
}

/** Deterministic staff command → section filter (no AI). */
export function resolveStaffCommand(query: string): {
  matched: boolean;
  commandId: string | null;
  sectionIds: string[];
  label: string;
} {
  const q = query.trim().toLowerCase();
  if (!q) return { matched: false, commandId: null, sectionIds: [], label: "" };

  const rules: Array<{ id: string; label: string; re: RegExp; sections: string[] }> = [
    { id: "arrivals", label: "Today's arrivals", re: /arrival|check.?in(?!.*cinema|.*event)/i, sections: ["arrivals"] },
    { id: "departures", label: "Today's departures", re: /departure|check.?out/i, sections: ["departures"] },
    { id: "unpaid", label: "Unpaid invoices", re: /unpaid|outstanding.*invoice|invoice/i, sections: ["pending_payments"] },
    {
      id: "verify",
      label: "Payments awaiting verification",
      re: /verif|awaiting.*payment|pending.*payment/i,
      sections: ["payment_verification"],
    },
    { id: "low_stock", label: "Low stock", re: /low.?stock|reorder|inventory.?alert/i, sections: ["low_stock"] },
    { id: "spa", label: "Today's spa appointments", re: /spa|treatment|massage/i, sections: ["spa_appointments"] },
    { id: "events", label: "Events tonight", re: /event/i, sections: ["events"] },
    { id: "cinema", label: "Showtimes", re: /cinema|showtime|movie/i, sections: ["showtimes"] },
    { id: "fitness", label: "Classes", re: /class|fitness|gym/i, sections: ["fitness_classes"] },
    { id: "dining", label: "Restaurant reservations", re: /restaurant|dining|table/i, sections: ["dining_reservations"] },
    { id: "maintenance", label: "Maintenance", re: /maintenance|blocking.?room|ooo/i, sections: ["maintenance", "housekeeping"] },
    { id: "tasks", label: "Tasks", re: /task|overdue/i, sections: ["tasks"] },
    { id: "orders", label: "Open orders", re: /order|kitchen/i, sections: ["open_orders"] },
  ];

  for (const rule of rules) {
    if (rule.re.test(q)) {
      return { matched: true, commandId: rule.id, sectionIds: rule.sections, label: rule.label };
    }
  }
  return { matched: false, commandId: null, sectionIds: [], label: query };
}

export async function staffOperationalSearch(opts: {
  tenantId: string;
  auth: StaffAuth;
  q: string;
  branchId?: string | null;
}) {
  const q = opts.q.trim();
  if (q.length < 2) return { results: [] as Array<Record<string, unknown>> };
  const auth = opts.auth;
  const tenantId = opts.tenantId;
  const like = { contains: q };
  const results: Array<{
    type: string;
    id: string;
    title: string;
    subtitle?: string;
    href: string;
  }> = [];

  const jobs: Array<Promise<void>> = [];

  if (has(auth, "customers.read")) {
    jobs.push(
      (async () => {
        const rows = await prisma.customer.findMany({
          where: {
            tenantId,
            OR: [{ displayName: like }, { email: like }, { phone: like }],
          },
          take: 8,
        });
        for (const c of rows) {
          results.push({
            type: "customer",
            id: c.id,
            title: c.displayName,
            subtitle: c.email ?? undefined,
            href: `/customers/${c.id}`,
          });
        }
      })(),
    );
  }

  if (has(auth, "bookings.read")) {
    jobs.push(
      (async () => {
        const rows = await prisma.booking.findMany({
          where: { tenantId, confirmationCode: like },
          take: 8,
        });
        for (const b of rows) {
          results.push({
            type: "booking",
            id: b.id,
            title: b.confirmationCode,
            subtitle: b.status,
            href: `/booking/bookings`,
          });
        }
      })(),
    );
    jobs.push(
      (async () => {
        const rows = await prisma.accommodationReservation.findMany({
          where: { tenantId, confirmationCode: like },
          take: 8,
        });
        for (const r of rows) {
          results.push({
            type: "reservation",
            id: r.id,
            title: r.confirmationCode,
            subtitle: r.status,
            href: `/accommodation/reservations`,
          });
        }
      })(),
    );
  }

  if (has(auth, "payments.read")) {
    jobs.push(
      (async () => {
        const rows = await prisma.invoice.findMany({
          where: { tenantId, number: like },
          take: 8,
        });
        for (const inv of rows) {
          results.push({
            type: "invoice",
            id: inv.id,
            title: inv.number,
            subtitle: inv.status,
            href: `/billing/invoices`,
          });
        }
      })(),
    );
  }

  if (has(auth, "inventory.read")) {
    jobs.push(
      (async () => {
        const rows = await prisma.inventoryItem.findMany({
          where: { tenantId, OR: [{ name: like }, { sku: like }] },
          take: 8,
        });
        for (const i of rows) {
          results.push({
            type: "inventory",
            id: i.id,
            title: i.name,
            subtitle: i.sku,
            href: `/operations/inventory`,
          });
        }
      })(),
    );
  }

  await Promise.all(jobs.map((j) => j.catch(() => undefined)));
  return { results: results.slice(0, 40) };
}

export async function getBusinessOverview(opts: {
  tenantId: string;
  auth: StaffAuth;
  day?: Date;
  branchId?: string | null;
}) {
  const { start, end } = dayBounds(opts.day);
  const auth = opts.auth;
  const tenantId = opts.tenantId;
  resolveBranchScope(auth, opts.branchId);

  const metrics: Array<{
    id: string;
    label: string;
    value: number | string;
    derived: boolean;
    note?: string;
  }> = [];

  if (has(auth, "bookings.read")) {
    const bookings = await prisma.booking.count({
      where: { tenantId, startsAt: { gte: start, lt: end }, status: { notIn: ["cancelled"] } },
    });
    metrics.push({
      id: "bookings_today",
      label: "Today's bookings",
      value: bookings,
      derived: true,
      note: "Count of non-cancelled booking-engine rows starting today",
    });
  }

  if (has(auth, "payments.read")) {
    const paid = await prisma.payment.aggregate({
      where: {
        tenantId,
        status: { in: ["captured", "partially_refunded"] },
        capturedAt: { gte: start, lt: end },
      },
      _sum: { capturedAmount: true },
      _count: true,
    });
    metrics.push({
      id: "revenue_today",
      label: "Today's captured payments (minor units)",
      value: paid._sum.capturedAmount ?? 0,
      derived: true,
      note: "Sum of capturedAmount — not settlement/P&L",
    });
    metrics.push({
      id: "paid_invoices_today",
      label: "Invoices paid today (count)",
      value: await prisma.invoice.count({
        where: { tenantId, status: "paid", paidAt: { gte: start, lt: end } },
      }),
      derived: true,
    });
    const outstanding = await prisma.invoice.aggregate({
      where: {
        tenantId,
        amountDue: { gt: 0 },
        status: { in: ["open", "partially_paid", "overdue"] },
      },
      _sum: { amountDue: true },
      _count: true,
    });
    metrics.push({
      id: "outstanding",
      label: "Outstanding invoice amount (minor units)",
      value: outstanding._sum.amountDue ?? 0,
      derived: true,
      note: `${outstanding._count} open invoices`,
    });
    const manualToday = await prisma.payment.aggregate({
      where: {
        tenantId,
        provider: "manual",
        status: { in: ["captured", "partially_refunded"] },
        capturedAt: { gte: start, lt: end },
      },
      _sum: { capturedAmount: true },
    });
    metrics.push({
      id: "manual_collections_today",
      label: "Manual collections today (minor units)",
      value: manualToday._sum.capturedAmount ?? 0,
      derived: true,
    });
    const refundsToday = await prisma.refund.aggregate({
      where: {
        tenantId,
        status: "completed",
        completedAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
      _count: true,
    });
    metrics.push({
      id: "refunds_today",
      label: "Refunds today (minor units)",
      value: refundsToday._sum.amount ?? 0,
      derived: true,
      note: `${refundsToday._count} refunds`,
    });
    metrics.push({
      id: "pending_verification",
      label: "Payments pending verification",
      value: await prisma.payment.count({
        where: { tenantId, status: "pending_verification" },
      }),
      derived: true,
    });
  }

  if (has(auth, "inventory.read")) {
    const alerts = await prisma.reorderAlert.count({ where: { tenantId, status: "open" } });
    const maint = await prisma.maintenanceRecord.count({
      where: { tenantId, status: { in: ["open", "in_progress"] } },
    });
    const tasks = await prisma.operationalTask.count({
      where: { tenantId, status: { in: ["open", "assigned", "in_progress"] } },
    });
    metrics.push({ id: "inventory_alerts", label: "Open inventory alerts", value: alerts, derived: true });
    metrics.push({ id: "maintenance_open", label: "Open maintenance", value: maint, derived: true });
    metrics.push({ id: "tasks_open", label: "Open tasks", value: tasks, derived: true });
  }

  if (has(auth, "orders.read")) {
    const orders = await prisma.diningOrder.count({
      where: { tenantId, status: { in: ["open", "submitted", "in_kitchen", "ready"] } },
    });
    metrics.push({ id: "open_orders", label: "Open dining orders", value: orders, derived: true });
  }

  return {
    day: start.toISOString().slice(0, 10),
    metrics,
    disclaimer: "Derived from live transactional data. Not an accounting or BI warehouse.",
  };
}

export function settingsSectionsForRole(role: string) {
  const sections: Array<{ id: string; title: string; permission: Permission; href: string }> = [
    { id: "organization", title: "Organization", permission: "settings.manage", href: "/settings/organization" },
    { id: "branches", title: "Branches", permission: "settings.manage", href: "/settings/branches" },
    { id: "branding", title: "Branding", permission: "settings.manage", href: "/settings/branding" },
    { id: "modules", title: "Modules", permission: "modules.manage", href: "/settings/modules" },
    { id: "staff", title: "Staff", permission: "staff.manage", href: "/staff" },
    { id: "roles", title: "Roles & Permissions", permission: "roles.manage", href: "/settings/roles" },
    { id: "booking", title: "Booking", permission: "bookings.write", href: "/booking/policies" },
    { id: "commerce", title: "Commerce", permission: "orders.write", href: "/commerce" },
    { id: "payments", title: "Payments", permission: "payments.read", href: "/billing" },
    { id: "notifications", title: "Notifications", permission: "notifications.manage", href: "/notifications" },
    { id: "crm", title: "CRM", permission: "customers.read", href: "/customers" },
    { id: "inventory", title: "Inventory", permission: "inventory.read", href: "/operations/inventory" },
    { id: "integrations", title: "Integrations", permission: "settings.manage", href: "/settings/integrations" },
    { id: "security", title: "Security", permission: "settings.manage", href: "/settings/security" },
    { id: "audit", title: "Audit", permission: "audit.read", href: "/settings/audit" },
  ];
  return sections.filter((s) => staffHasPermission(role, s.permission));
}
