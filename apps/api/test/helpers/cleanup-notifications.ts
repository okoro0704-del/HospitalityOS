import type { PrismaClient } from "@prisma/client";

export async function clearNotificationsModule(prisma: PrismaClient) {
  await prisma.notificationSchedule.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.notificationRecipient.deleteMany();
  await prisma.notificationAuditEvent.deleteMany();
  await prisma.communicationLog.deleteMany();
  await prisma.notificationEvent.deleteMany();
  await prisma.notificationRule.deleteMany();
  await prisma.notificationTemplate.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.notificationChannelConfig.deleteMany();
  await prisma.messageVariable.deleteMany();
  await prisma.notification.deleteMany();
}
