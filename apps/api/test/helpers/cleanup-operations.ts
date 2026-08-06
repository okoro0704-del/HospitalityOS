import type { PrismaClient } from "@prisma/client";

export async function clearOperationsModule(prisma: PrismaClient) {
  await prisma.operationalTaskComment.deleteMany();
  await prisma.operationalTask.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.assetAssignment.deleteMany();
  await prisma.operationalAsset.deleteMany();
  await prisma.assetCategory.deleteMany();
  await prisma.purchaseRequestItem.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.inventorySupplierItem.deleteMany();
  await prisma.inventorySupplier.deleteMany();
  await prisma.reorderAlert.deleteMany();
  await prisma.inventoryReorderRule.deleteMany();
  await prisma.stockCountItem.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryBalance.deleteMany();
  await prisma.inventoryArea.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.inventoryCategory.deleteMany();
  await prisma.inventoryLocation.deleteMany();
}
