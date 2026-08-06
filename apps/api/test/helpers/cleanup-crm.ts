import type { PrismaClient } from "@prisma/client";

export async function clearCrmModule(prisma: PrismaClient) {
  await prisma.customerMergeRequest.deleteMany();
  await prisma.customerRelationship.deleteMany();
  await prisma.customerCommunicationPreference.deleteMany();
  await prisma.customerLoyaltyProfile.deleteMany();
  await prisma.customerReview.deleteMany();
  await prisma.customerFeedback.deleteMany();
  await prisma.customerVisit.deleteMany();
  await prisma.customerEvent.deleteMany();
  await prisma.customerInteraction.deleteMany();
  await prisma.customerSegment.deleteMany();
  await prisma.customerConsent.deleteMany();
  await prisma.customerNote.deleteMany();
  await prisma.customerTagLink.deleteMany();
  await prisma.customerTag.deleteMany();
  await prisma.customerPreference.deleteMany();
  await prisma.customerAddress.deleteMany();
  await prisma.customerContact.deleteMany();
}
