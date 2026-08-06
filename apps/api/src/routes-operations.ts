import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  INVENTORY_UNITS,
  INVENTORY_TX_TYPES,
  PURCHASE_REQUEST_STATUSES,
  ASSET_STATUSES,
  ASSET_MAINTENANCE_STATUSES,
  OPS_TASK_STATUSES,
} from "@hospitalityos/shared";
import { prisma } from "./db.js";
import {
  requireStaff,
  requireStaffRoles,
  type StaffAuth,
} from "./lib/auth.js";
import { requireInventoryModule } from "./lib/module-gate.js";
import { writeAudit } from "./lib/audit.js";
import {
  createInventoryItem,
  createInventoryLocation,
  linkCommerceProductToInventory,
  postInventoryTransaction,
  recordStockCountItem,
  startStockCount,
  submitStockCount,
  transferStock,
} from "./services/operations.js";

function mapErr(err: unknown) {
  const e = err as { statusCode?: number; code?: string; message?: string };
  return {
    status: e.statusCode ?? 500,
    body: { error: e.code ?? "internal_error", message: e.message ?? "Unexpected error" },
  };
}

async function staffPre(roles?: Parameters<typeof requireStaffRoles>[0]) {
  if (roles) {
    const roleGuard = await requireStaffRoles(roles);
    return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
      await roleGuard(req, reply);
      if (reply.sent) return;
      await requireInventoryModule(req, reply);
    };
  }
  return async (req: Parameters<typeof requireStaff>[0], reply: Parameters<typeof requireStaff>[1]) => {
    await requireStaff(req, reply);
    if (reply.sent) return;
    await requireInventoryModule(req, reply);
  };
}

export async function registerOperationsRoutes(app: FastifyInstance) {
  const staffAny = await staffPre();
  const staffOps = await staffPre([
    "owner",
    "admin",
    "manager",
    "operations",
    "inventory_manager",
    "storekeeper",
    "front_desk",
  ]);
  const staffAdmin = await staffPre([
    "owner",
    "admin",
    "manager",
    "inventory_manager",
  ]);
  const staffMaint = await staffPre([
    "owner",
    "admin",
    "manager",
    "operations",
    "maintenance_staff",
    "inventory_manager",
  ]);

  app.get("/operations/dashboard", { preHandler: staffAny }, async (req) => {
    const tenantId = req.tenantId!;
    const [locations, items, lowStock, openTasks, openMaint, openAlerts] = await Promise.all([
      prisma.inventoryLocation.count({ where: { tenantId, status: "active" } }),
      prisma.inventoryItem.count({ where: { tenantId, status: "active" } }),
      prisma.inventoryBalance.count({
        where: { tenantId, available: { lte: 5 } },
      }),
      prisma.operationalTask.count({
        where: { tenantId, status: { in: ["open", "assigned", "in_progress"] } },
      }),
      prisma.maintenanceRecord.count({
        where: { tenantId, status: { in: ["open", "in_progress"] } },
      }),
      prisma.reorderAlert.count({ where: { tenantId, status: "open" } }),
    ]);
    return { locations, items, lowStock, openTasks, openMaint, openAlerts };
  });

  /* Locations */
  app.get("/operations/locations", { preHandler: staffAny }, async (req) => {
    const locations = await prisma.inventoryLocation.findMany({
      where: { tenantId: req.tenantId! },
      include: { areas: true, children: true },
      orderBy: { name: "asc" },
    });
    return { locations };
  });

  app.post("/operations/locations", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        parentId: z.string().optional(),
      })
      .parse(req.body);
    try {
      const location = await createInventoryLocation({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ location });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/operations/locations/:id/areas", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional() })
      .parse(req.body);
    const loc = await prisma.inventoryLocation.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!loc) return reply.code(404).send({ error: "not_found", message: "Location not found" });
    const area = await prisma.inventoryArea.create({
      data: {
        tenantId: req.tenantId!,
        locationId: loc.id,
        name: body.name,
        code: body.code,
        description: body.description ?? null,
      },
    });
    return reply.code(201).send({ area });
  });

  /* Categories & items */
  app.get("/operations/categories", { preHandler: staffAny }, async (req) => {
    const categories = await prisma.inventoryCategory.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return { categories };
  });

  app.post("/operations/categories", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional() })
      .parse(req.body);
    const category = await prisma.inventoryCategory.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        description: body.description ?? null,
      },
    });
    return reply.code(201).send({ category });
  });

  app.get("/operations/items", { preHandler: staffAny }, async (req) => {
    const items = await prisma.inventoryItem.findMany({
      where: { tenantId: req.tenantId! },
      include: { category: true, balances: true },
      orderBy: { name: "asc" },
    });
    return { items };
  });

  app.post("/operations/items", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        sku: z.string().min(1),
        categoryId: z.string().optional(),
        unit: z.enum(INVENTORY_UNITS).optional(),
        description: z.string().optional(),
        minQuantity: z.number().optional(),
        maxQuantity: z.number().optional(),
        reorderPoint: z.number().optional(),
        allowNegative: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const item = await createInventoryItem({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ item });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  /* Stock */
  app.get("/operations/stock", { preHandler: staffAny }, async (req) => {
    const balances = await prisma.inventoryBalance.findMany({
      where: { tenantId: req.tenantId! },
      include: { item: true, location: true },
      orderBy: { updatedAt: "desc" },
    });
    return { balances };
  });

  app.post("/operations/transactions", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        itemId: z.string().min(1),
        locationId: z.string().min(1),
        type: z.enum(INVENTORY_TX_TYPES),
        quantity: z.number().positive(),
        direction: z.enum(["in", "out"]).optional(),
        reason: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = await postInventoryTransaction({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send(result);
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/operations/transactions", { preHandler: staffAny }, async (req) => {
    const transactions = await prisma.inventoryTransaction.findMany({
      where: { tenantId: req.tenantId! },
      include: { item: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { transactions };
  });

  app.post("/operations/movements", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        itemId: z.string().min(1),
        fromLocationId: z.string().min(1),
        toLocationId: z.string().min(1),
        quantity: z.number().positive(),
        reason: z.string().optional(),
      })
      .parse(req.body);
    try {
      const result = await transferStock({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send(result);
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.get("/operations/movements", { preHandler: staffAny }, async (req) => {
    const movements = await prisma.inventoryMovement.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { movements };
  });

  /* Stock counts */
  app.get("/operations/counts", { preHandler: staffAny }, async (req) => {
    const counts = await prisma.stockCount.findMany({
      where: { tenantId: req.tenantId! },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return { counts };
  });

  app.post("/operations/counts", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        locationId: z.string().min(1),
        name: z.string().min(1),
        notes: z.string().optional(),
      })
      .parse(req.body);
    try {
      const count = await startStockCount({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return reply.code(201).send({ count });
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/operations/counts/:id/items", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ itemId: z.string().min(1), actualQty: z.number().nonnegative() })
      .parse(req.body);
    try {
      const item = await recordStockCountItem({
        tenantId: req.tenantId!,
        stockCountId: id,
        itemId: body.itemId,
        actualQty: body.actualQty,
      });
      return { item };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.post("/operations/counts/:id/submit", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const count = await submitStockCount({
        tenantId: req.tenantId!,
        stockCountId: id,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { count };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  /* Reorder */
  app.get("/operations/reorder-rules", { preHandler: staffAny }, async (req) => {
    const rules = await prisma.inventoryReorderRule.findMany({
      where: { tenantId: req.tenantId! },
      include: { item: true },
    });
    return { rules };
  });

  app.post("/operations/reorder-rules", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        itemId: z.string().min(1),
        locationId: z.string().optional(),
        reorderPoint: z.number().nonnegative(),
        reorderQuantity: z.number().positive(),
        supplierId: z.string().optional(),
      })
      .parse(req.body);
    const rule = await prisma.inventoryReorderRule.create({
      data: {
        tenantId: req.tenantId!,
        itemId: body.itemId,
        locationId: body.locationId ?? null,
        reorderPoint: body.reorderPoint,
        reorderQuantity: body.reorderQuantity,
        supplierId: body.supplierId ?? null,
        status: "active",
      },
    });
    return reply.code(201).send({ rule });
  });

  app.get("/operations/reorder-alerts", { preHandler: staffAny }, async (req) => {
    const alerts = await prisma.reorderAlert.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { alerts };
  });

  /* Suppliers */
  app.get("/operations/suppliers", { preHandler: staffAny }, async (req) => {
    const suppliers = await prisma.inventorySupplier.findMany({
      where: { tenantId: req.tenantId! },
      include: { items: true },
      orderBy: { name: "asc" },
    });
    return { suppliers };
  });

  app.post("/operations/suppliers", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const supplier = await prisma.inventorySupplier.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        contactName: body.contactName ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        status: "active",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "inventory_supplier.created",
      resource: "inventory_supplier",
      resourceId: supplier.id,
    });
    return reply.code(201).send({ supplier });
  });

  app.post("/operations/suppliers/:id/items", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        itemId: z.string().min(1),
        supplierSku: z.string().optional(),
        unitCost: z.number().nonnegative().optional(),
      })
      .parse(req.body);
    const link = await prisma.inventorySupplierItem.create({
      data: {
        tenantId: req.tenantId!,
        supplierId: id,
        itemId: body.itemId,
        supplierSku: body.supplierSku ?? null,
        unitCost: body.unitCost ?? 0,
      },
    });
    return reply.code(201).send({ link });
  });

  /* Purchase requests */
  app.get("/operations/purchase-requests", { preHandler: staffAny }, async (req) => {
    const requests = await prisma.purchaseRequest.findMany({
      where: { tenantId: req.tenantId! },
      include: { items: true, supplier: true },
      orderBy: { createdAt: "desc" },
    });
    return { requests };
  });

  app.post("/operations/purchase-requests", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        supplierId: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(
          z.object({
            itemId: z.string().min(1),
            quantity: z.number().positive(),
            unitCost: z.number().nonnegative().optional(),
          }),
        ),
      })
      .parse(req.body);
    const request = await prisma.purchaseRequest.create({
      data: {
        tenantId: req.tenantId!,
        supplierId: body.supplierId ?? null,
        notes: body.notes ?? null,
        requesterId: (req.auth as StaffAuth).staffId,
        status: "draft",
        items: {
          create: body.items.map((i) => ({
            tenantId: req.tenantId!,
            itemId: i.itemId,
            quantity: i.quantity,
            unitCost: i.unitCost ?? 0,
          })),
        },
      },
      include: { items: true },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "purchase_request.created",
      resource: "purchase_request",
      resourceId: request.id,
    });
    return reply.code(201).send({ request });
  });

  app.patch("/operations/purchase-requests/:id/status", { preHandler: staffAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(PURCHASE_REQUEST_STATUSES) }).parse(req.body);
    const existing = await prisma.purchaseRequest.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!existing) return reply.code(404).send({ error: "not_found", message: "Request not found" });
    const data: {
      status: string;
      submittedAt?: Date;
      decidedAt?: Date;
      completedAt?: Date;
      approverId?: string;
    } = { status: body.status };
    if (body.status === "submitted") data.submittedAt = new Date();
    if (["approved", "rejected"].includes(body.status)) {
      data.decidedAt = new Date();
      data.approverId = (req.auth as StaffAuth).staffId;
    }
    if (body.status === "completed") data.completedAt = new Date();
    const request = await prisma.purchaseRequest.update({ where: { id }, data });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "purchase_request.status",
      resource: "purchase_request",
      resourceId: id,
      metadata: { status: body.status },
    });
    return { request };
  });

  /* Assets */
  app.get("/operations/assets", { preHandler: staffAny }, async (req) => {
    const assets = await prisma.operationalAsset.findMany({
      where: { tenantId: req.tenantId! },
      include: { category: true, location: true },
      orderBy: { name: "asc" },
    });
    return { assets };
  });

  app.post("/operations/assets", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        categoryId: z.string().optional(),
        locationId: z.string().optional(),
        serialNumber: z.string().optional(),
        status: z.enum(ASSET_STATUSES).optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const asset = await prisma.operationalAsset.create({
      data: {
        tenantId: req.tenantId!,
        name: body.name,
        code: body.code,
        categoryId: body.categoryId ?? null,
        locationId: body.locationId ?? null,
        serialNumber: body.serialNumber ?? null,
        status: body.status ?? "available",
        notes: body.notes ?? null,
        metadata: {},
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "asset.created",
      resource: "operational_asset",
      resourceId: asset.id,
    });
    return reply.code(201).send({ asset });
  });

  app.post("/operations/asset-categories", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1), code: z.string().min(1) })
      .parse(req.body);
    const category = await prisma.assetCategory.create({
      data: { tenantId: req.tenantId!, name: body.name, code: body.code },
    });
    return reply.code(201).send({ category });
  });

  /* Maintenance */
  app.get("/operations/maintenance", { preHandler: staffAny }, async (req) => {
    const records = await prisma.maintenanceRecord.findMany({
      where: { tenantId: req.tenantId! },
      include: { asset: true },
      orderBy: { createdAt: "desc" },
    });
    return { records };
  });

  app.post("/operations/maintenance", { preHandler: staffMaint }, async (req, reply) => {
    const body = z
      .object({
        assetId: z.string().min(1),
        issue: z.string().min(1),
        priority: z.string().optional(),
        assigneeId: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const record = await prisma.maintenanceRecord.create({
      data: {
        tenantId: req.tenantId!,
        assetId: body.assetId,
        issue: body.issue,
        priority: body.priority ?? "medium",
        assigneeId: body.assigneeId ?? null,
        notes: body.notes ?? null,
        status: "open",
      },
    });
    await prisma.operationalAsset.updateMany({
      where: { id: body.assetId, tenantId: req.tenantId! },
      data: { status: "maintenance" },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "maintenance.created",
      resource: "maintenance_record",
      resourceId: record.id,
    });
    return reply.code(201).send({ record });
  });

  app.patch("/operations/maintenance/:id/status", { preHandler: staffMaint }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(ASSET_MAINTENANCE_STATUSES) }).parse(req.body);
    const existing = await prisma.maintenanceRecord.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!existing) return reply.code(404).send({ error: "not_found", message: "Record not found" });
    const record = await prisma.maintenanceRecord.update({
      where: { id },
      data: {
        status: body.status,
        resolvedAt: ["resolved", "closed"].includes(body.status) ? new Date() : existing.resolvedAt,
      },
    });
    if (["resolved", "closed"].includes(body.status)) {
      await prisma.operationalAsset.updateMany({
        where: { id: existing.assetId, tenantId: req.tenantId! },
        data: { status: "available" },
      });
    }
    return { record };
  });

  /* Tasks */
  app.get("/operations/tasks", { preHandler: staffAny }, async (req) => {
    const tasks = await prisma.operationalTask.findMany({
      where: { tenantId: req.tenantId! },
      include: { comments: true },
      orderBy: { createdAt: "desc" },
    });
    return { tasks };
  });

  app.post("/operations/tasks", { preHandler: staffOps }, async (req, reply) => {
    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.string().optional(),
        assigneeId: z.string().optional(),
        dueAt: z.string().datetime().optional(),
        relatedEntityType: z.string().optional(),
        relatedEntityId: z.string().optional(),
      })
      .parse(req.body);
    const task = await prisma.operationalTask.create({
      data: {
        tenantId: req.tenantId!,
        title: body.title,
        description: body.description ?? null,
        priority: body.priority ?? "medium",
        assigneeId: body.assigneeId ?? null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        relatedEntityType: body.relatedEntityType ?? null,
        relatedEntityId: body.relatedEntityId ?? null,
        status: body.assigneeId ? "assigned" : "open",
      },
    });
    await writeAudit({
      tenantId: req.tenantId!,
      actorKind: "staff",
      actorId: (req.auth as StaffAuth).staffId,
      action: "ops_task.created",
      resource: "operational_task",
      resourceId: task.id,
    });
    return reply.code(201).send({ task });
  });

  app.patch("/operations/tasks/:id/status", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(OPS_TASK_STATUSES) }).parse(req.body);
    const existing = await prisma.operationalTask.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!existing) return reply.code(404).send({ error: "not_found", message: "Task not found" });
    const task = await prisma.operationalTask.update({
      where: { id },
      data: {
        status: body.status,
        completedAt: body.status === "completed" ? new Date() : existing.completedAt,
      },
    });
    return { task };
  });

  app.post("/operations/tasks/:id/comments", { preHandler: staffOps }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ body: z.string().min(1) }).parse(req.body);
    const task = await prisma.operationalTask.findFirst({
      where: { id, tenantId: req.tenantId! },
    });
    if (!task) return reply.code(404).send({ error: "not_found", message: "Task not found" });
    const comment = await prisma.operationalTaskComment.create({
      data: {
        tenantId: req.tenantId!,
        taskId: id,
        body: body.body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      },
    });
    return reply.code(201).send({ comment });
  });

  /* Commerce link */
  app.post("/operations/commerce-link", { preHandler: staffAdmin }, async (req, reply) => {
    const body = z
      .object({
        offeringId: z.string().min(1),
        inventoryItemId: z.string().min(1),
      })
      .parse(req.body);
    try {
      const detail = await linkCommerceProductToInventory({
        tenantId: req.tenantId!,
        ...body,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
      });
      return { productDetail: detail };
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });
}
