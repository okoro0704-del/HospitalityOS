import type { PrismaClient } from "@prisma/client";

export async function clearDiningModule(prisma: PrismaClient) {
  await prisma.kitchenTicket.deleteMany();
  await prisma.diningOrderItem.deleteMany();
  await prisma.diningOrder.deleteMany();
  await prisma.diningSession.deleteMany();
  await prisma.serverAssignment.deleteMany();
  await prisma.diningReservation.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuSection.deleteMany();
  await prisma.diningMenu.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.tableGroup.deleteMany();
  await prisma.diningArea.deleteMany();
  await prisma.kitchenStation.deleteMany();
  await prisma.diningShift.deleteMany();
  await prisma.serviceChargeRule.deleteMany();
}
