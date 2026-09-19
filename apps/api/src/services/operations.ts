import { prisma } from "../db.js";
import { writeAudit } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";

function httpError(message: string, code: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

async function ensureBalance(opts: {
  tenantId: string;
  itemId: string;
  locationId: string;
}) {
  const existing = await prisma.inventoryBalance.findUnique({
    where: {
      tenantId_itemId_locationId: {
        tenantId: opts.tenantId,
        itemId: opts.itemId,
        locationId: opts.locationId,
      },
    },
  });
  if (existing) return existing;
  return prisma.inventoryBalance.create({
    data: {
      tenantId: opts.tenantId,
      itemId: opts.itemId,
      locationId: opts.locationId,
      onHand: 0,
      reserved: 0,
      available: 0,
      damaged: 0,
      expired: 0,
    },
  });
}

/**
 * Atomic stock delta. Positive = receive, negative = consume/transfer out.
 * Prevents available from going negative unless item.allowNegative.
 */
async function applyStockDelta(opts: {
  tenantId: string;
  itemId: string;
  locationId: string;
  delta: number;
  allowNegative: boolean;
}): Promise<{ ok: boolean; balanceId: string; availableAfter: number; onHandAfter: number }> {
  const balance = await ensureBalance({
    tenantId: opts.tenantId,
    itemId: opts.itemId,
    locationId: opts.locationId,
  });

  if (opts.allowNegative) {
    const result = await prisma.$executeRaw`
      UPDATE InventoryBalance
      SET onHand = onHand + ${opts.delta},
          available = available + ${opts.delta},
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${balance.id}
    `;
    if (Number(result) !== 1) return { ok: false, balanceId: balance.id, availableAfter: 0, onHandAfter: 0 };
  } else {
    const result = await prisma.$executeRaw`
      UPDATE InventoryBalance
      SET onHand = onHand + ${opts.delta},
          available = available + ${opts.delta},
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${balance.id}
        AND available + ${opts.delta} >= 0
    `;
    if (Number(result) !== 1) {
      return { ok: false, balanceId: balance.id, availableAfter: balance.available, onHandAfter: balance.onHand };
    }
  }

  const updated = await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
  return {
    ok: true,
    balanceId: updated.id,
    availableAfter: updated.available,
    onHandAfter: updated.onHand,
  };
}

async function maybeReorderAlert(opts: {
  tenantId: string;
  itemId: string;
  locationId: string;
  onHand: number;
}) {
  const rules = await prisma.inventoryReorderRule.findMany({
    where: {
      tenantId: opts.tenantId,
      itemId: opts.itemId,
      status: "active",
      OR: [{ locationId: opts.locationId }, { locationId: null }],
    },
  });
  for (const rule of rules) {
    if (opts.onHand > rule.reorderPoint) continue;
    const existing = await prisma.reorderAlert.findFirst({
      where: {
        tenantId: opts.tenantId,
        itemId: opts.itemId,
        locationId: opts.locationId,
        status: "open",
      },
    });
    if (existing) continue;
    await prisma.reorderAlert.create({
      data: {
        tenantId: opts.tenantId,
        itemId: opts.itemId,
        locationId: opts.locationId,
        reorderRuleId: rule.id,
        onHand: opts.onHand,
        reorderPoint: rule.reorderPoint,
        status: "open",
      },
    });
    await prisma.inventoryReorderRule.update({
      where: { id: rule.id },
      data: { lastAlertAt: new Date() },
    });
    await createNotification({
      tenantId: opts.tenantId,
      actorKind: "system",
      title: "Reorder alert",
      body: `Stock for an item reached reorder point (${opts.onHand} ≤ ${rule.reorderPoint}).`,
      metadata: { itemId: opts.itemId, locationId: opts.locationId, ruleId: rule.id },
    });
  }
}

export async function createInventoryLocation(opts: {
  tenantId: string;
  name: string;
  code: string;
  description?: string | null;
  parentId?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  if (opts.parentId) {
    const parent = await prisma.inventoryLocation.findFirst({
      where: { id: opts.parentId, tenantId: opts.tenantId },
    });
    if (!parent) throw httpError("Parent location not found", "not_found", 404);
  }
  const location = await prisma.inventoryLocation.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name,
      code: opts.code,
      description: opts.description ?? null,
      parentId: opts.parentId ?? null,
      status: "active",
      metadata: {},
    },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "inventory_location.created",
    resource: "inventory_location",
    resourceId: location.id,
  });
  return location;
}

export async function createInventoryItem(opts: {
  tenantId: string;
  name: string;
  sku: string;
  categoryId?: string | null;
  unit?: string;
  description?: string | null;
  minQuantity?: number;
  maxQuantity?: number | null;
  reorderPoint?: number;
  allowNegative?: boolean;
  actorKind: string;
  actorId?: string | null;
}) {
  const item = await prisma.inventoryItem.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name,
      sku: opts.sku,
      categoryId: opts.categoryId ?? null,
      unit: opts.unit ?? "piece",
      description: opts.description ?? null,
      minQuantity: opts.minQuantity ?? 0,
      maxQuantity: opts.maxQuantity ?? null,
      reorderPoint: opts.reorderPoint ?? 0,
      allowNegative: opts.allowNegative ?? false,
      status: "active",
      metadata: {},
    },
  });
  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "inventory_item.created",
    resource: "inventory_item",
    resourceId: item.id,
  });
  return item;
}

export async function postInventoryTransaction(opts: {
  tenantId: string;
  itemId: string;
  locationId: string;
  type: string;
  quantity: number;
  direction?: "in" | "out";
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorKind: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (opts.quantity <= 0) throw httpError("Quantity must be positive", "validation_error", 400);

  const item = await prisma.inventoryItem.findFirst({
    where: { id: opts.itemId, tenantId: opts.tenantId },
  });
  if (!item) throw httpError("Item not found", "not_found", 404);
  const location = await prisma.inventoryLocation.findFirst({
    where: { id: opts.locationId, tenantId: opts.tenantId },
  });
  if (!location) throw httpError("Location not found", "not_found", 404);

  const direction = opts.direction ?? (["consumption", "damage", "waste", "transfer"].includes(opts.type) ? "out" : "in");
  const delta = direction === "out" ? -opts.quantity : opts.quantity;

  const applied = await applyStockDelta({
    tenantId: opts.tenantId,
    itemId: item.id,
    locationId: location.id,
    delta,
    allowNegative: item.allowNegative,
  });
  if (!applied.ok) {
    throw httpError("Insufficient available stock", "insufficient_stock", 409);
  }

  const tx = await prisma.inventoryTransaction.create({
    data: {
      tenantId: opts.tenantId,
      itemId: item.id,
      locationId: location.id,
      type: opts.type,
      quantity: opts.quantity,
      direction,
      reason: opts.reason ?? null,
      referenceType: opts.referenceType ?? null,
      referenceId: opts.referenceId ?? null,
      balanceAfter: applied.onHandAfter,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
      metadata: (opts.metadata ?? {}) as object,
    },
  });

  if (opts.type === "adjustment" || opts.type === "stock_count") {
    await prisma.inventoryAdjustment.create({
      data: {
        tenantId: opts.tenantId,
        itemId: item.id,
        locationId: location.id,
        transactionId: tx.id,
        quantityDelta: delta,
        reason: opts.reason ?? null,
        actorKind: opts.actorKind,
        actorId: opts.actorId ?? null,
      },
    });
  }

  await maybeReorderAlert({
    tenantId: opts.tenantId,
    itemId: item.id,
    locationId: location.id,
    onHand: applied.onHandAfter,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "inventory_transaction.posted",
    resource: "inventory_transaction",
    resourceId: tx.id,
    metadata: { type: opts.type, quantity: opts.quantity, direction },
  });

  return { transaction: tx, balanceAfter: applied };
}

export async function transferStock(opts: {
  tenantId: string;
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reason?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  if (opts.fromLocationId === opts.toLocationId) {
    throw httpError("Source and destination must differ", "validation_error", 400);
  }
  if (opts.quantity <= 0) throw httpError("Quantity must be positive", "validation_error", 400);

  const item = await prisma.inventoryItem.findFirst({
    where: { id: opts.itemId, tenantId: opts.tenantId },
  });
  if (!item) throw httpError("Item not found", "not_found", 404);

  const out = await applyStockDelta({
    tenantId: opts.tenantId,
    itemId: opts.itemId,
    locationId: opts.fromLocationId,
    delta: -opts.quantity,
    allowNegative: item.allowNegative,
  });
  if (!out.ok) throw httpError("Insufficient available stock at source", "insufficient_stock", 409);

  const inn = await applyStockDelta({
    tenantId: opts.tenantId,
    itemId: opts.itemId,
    locationId: opts.toLocationId,
    delta: opts.quantity,
    allowNegative: true,
  });
  if (!inn.ok) {
    await applyStockDelta({
      tenantId: opts.tenantId,
      itemId: opts.itemId,
      locationId: opts.fromLocationId,
      delta: opts.quantity,
      allowNegative: true,
    });
    throw httpError("Transfer failed at destination", "transfer_failed", 500);
  }

  const outTx = await prisma.inventoryTransaction.create({
    data: {
      tenantId: opts.tenantId,
      itemId: opts.itemId,
      locationId: opts.fromLocationId,
      type: "transfer",
      quantity: opts.quantity,
      direction: "out",
      reason: opts.reason ?? null,
      balanceAfter: out.onHandAfter,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
      metadata: { toLocationId: opts.toLocationId },
    },
  });
  const inTx = await prisma.inventoryTransaction.create({
    data: {
      tenantId: opts.tenantId,
      itemId: opts.itemId,
      locationId: opts.toLocationId,
      type: "transfer",
      quantity: opts.quantity,
      direction: "in",
      reason: opts.reason ?? null,
      balanceAfter: inn.onHandAfter,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
      metadata: { fromLocationId: opts.fromLocationId },
    },
  });

  const movement = await prisma.inventoryMovement.create({
    data: {
      tenantId: opts.tenantId,
      itemId: opts.itemId,
      fromLocationId: opts.fromLocationId,
      toLocationId: opts.toLocationId,
      quantity: opts.quantity,
      reason: opts.reason ?? null,
      outTransactionId: outTx.id,
      inTransactionId: inTx.id,
      actorKind: opts.actorKind,
      actorId: opts.actorId ?? null,
    },
  });

  await maybeReorderAlert({
    tenantId: opts.tenantId,
    itemId: opts.itemId,
    locationId: opts.fromLocationId,
    onHand: out.onHandAfter,
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "inventory_movement.created",
    resource: "inventory_movement",
    resourceId: movement.id,
  });

  return { movement, outTx, inTx };
}

export async function startStockCount(opts: {
  tenantId: string;
  locationId: string;
  name: string;
  notes?: string | null;
  actorId?: string | null;
  actorKind: string;
}) {
  const location = await prisma.inventoryLocation.findFirst({
    where: { id: opts.locationId, tenantId: opts.tenantId },
  });
  if (!location) throw httpError("Location not found", "not_found", 404);

  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId: opts.tenantId, locationId: location.id },
  });

  const count = await prisma.stockCount.create({
    data: {
      tenantId: opts.tenantId,
      locationId: location.id,
      name: opts.name,
      notes: opts.notes ?? null,
      status: "in_progress",
      actorId: opts.actorId ?? null,
      items: {
        create: balances.map((b) => ({
          tenantId: opts.tenantId,
          itemId: b.itemId,
          expectedQty: b.onHand,
        })),
      },
    },
    include: { items: true },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "stock_count.started",
    resource: "stock_count",
    resourceId: count.id,
  });

  return count;
}

export async function recordStockCountItem(opts: {
  tenantId: string;
  stockCountId: string;
  itemId: string;
  actualQty: number;
}) {
  const count = await prisma.stockCount.findFirst({
    where: { id: opts.stockCountId, tenantId: opts.tenantId },
  });
  if (!count) throw httpError("Stock count not found", "not_found", 404);
  if (!["draft", "in_progress"].includes(count.status)) {
    throw httpError("Stock count is not editable", "invalid_status", 409);
  }

  const line = await prisma.stockCountItem.findFirst({
    where: { stockCountId: count.id, itemId: opts.itemId },
  });
  if (!line) {
    return prisma.stockCountItem.create({
      data: {
        tenantId: opts.tenantId,
        stockCountId: count.id,
        itemId: opts.itemId,
        expectedQty: 0,
        actualQty: opts.actualQty,
        variance: opts.actualQty,
      },
    });
  }
  return prisma.stockCountItem.update({
    where: { id: line.id },
    data: {
      actualQty: opts.actualQty,
      variance: opts.actualQty - line.expectedQty,
    },
  });
}

export async function submitStockCount(opts: {
  tenantId: string;
  stockCountId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const count = await prisma.stockCount.findFirst({
    where: { id: opts.stockCountId, tenantId: opts.tenantId },
    include: { items: true },
  });
  if (!count) throw httpError("Stock count not found", "not_found", 404);
  if (count.status === "submitted") return count;

  for (const line of count.items) {
    if (line.actualQty == null) continue;
    const delta = line.actualQty - line.expectedQty;
    if (delta === 0) continue;
    await postInventoryTransaction({
      tenantId: opts.tenantId,
      itemId: line.itemId,
      locationId: count.locationId,
      type: "stock_count",
      quantity: Math.abs(delta),
      direction: delta > 0 ? "in" : "out",
      reason: `Stock count ${count.name}`,
      referenceType: "stock_count",
      referenceId: count.id,
      actorKind: opts.actorKind,
      actorId: opts.actorId,
    });
  }

  const updated = await prisma.stockCount.update({
    where: { id: count.id },
    data: { status: "submitted", submittedAt: new Date() },
    include: { items: true },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "stock_count.submitted",
    resource: "stock_count",
    resourceId: count.id,
  });

  return updated;
}

/** Extension point: vertical modules may call this to consume stock transactionally. */
export async function consumeInventory(opts: {
  tenantId: string;
  itemId: string;
  locationId: string;
  quantity: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorKind: string;
  actorId?: string | null;
}) {
  return postInventoryTransaction({
    ...opts,
    type: "consumption",
    direction: "out",
  });
}

export async function linkCommerceProductToInventory(opts: {
  tenantId: string;
  offeringId: string;
  inventoryItemId: string;
  actorKind: string;
  actorId?: string | null;
}) {
  const offering = await prisma.offering.findFirst({
    where: { id: opts.offeringId, tenantId: opts.tenantId },
    include: { productDetail: true },
  });
  if (!offering?.productDetail) {
    throw httpError("Product offering not found", "not_found", 404);
  }
  const item = await prisma.inventoryItem.findFirst({
    where: { id: opts.inventoryItemId, tenantId: opts.tenantId },
  });
  if (!item) throw httpError("Inventory item not found", "not_found", 404);

  const detail = await prisma.productDetail.update({
    where: { id: offering.productDetail.id },
    data: { inventoryItemId: item.id },
  });

  await writeAudit({
    tenantId: opts.tenantId,
    actorKind: opts.actorKind,
    actorId: opts.actorId,
    action: "commerce.inventory_linked",
    resource: "product_detail",
    resourceId: detail.id,
    metadata: { offeringId: offering.id, inventoryItemId: item.id },
  });

  return detail;
}
