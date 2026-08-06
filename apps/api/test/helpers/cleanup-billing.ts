import type { PrismaClient } from "@prisma/client";

export async function clearBillingModule(prisma: PrismaClient) {
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.paymentAuditEvent.deleteMany();
  await prisma.settlementItem.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.billingTransaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentIntent.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.paymentLink.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.billableItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billingTaxRule.deleteMany();
  await prisma.billingAccount.deleteMany();
  await prisma.paymentCustomer.deleteMany();
}
