import type { PrismaClient } from "@prisma/client";

export async function clearSpaModule(prisma: PrismaClient) {
  await prisma.aftercareNote.deleteMany();
  await prisma.treatmentNote.deleteMany();
  await prisma.spaConsultation.deleteMany();
  await prisma.spaAppointment.deleteMany();
  await prisma.wellnessFacilitySession.deleteMany();
  await prisma.spaShift.deleteMany();
  await prisma.therapistTreatmentLink.deleteMany();
  await prisma.therapistSpecialty.deleteMany();
  await prisma.treatmentVariant.deleteMany();
  await prisma.spaMembership.deleteMany();
  await prisma.spaMembershipPlan.deleteMany();
  await prisma.spaPackage.deleteMany();
  await prisma.spaClientProfile.deleteMany();
  await prisma.treatment.deleteMany();
  await prisma.treatmentCategory.deleteMany();
  await prisma.spaTherapist.deleteMany();
  await prisma.treatmentRoom.deleteMany();
  await prisma.wellnessArea.deleteMany();
  await prisma.spaFacility.deleteMany();
}
