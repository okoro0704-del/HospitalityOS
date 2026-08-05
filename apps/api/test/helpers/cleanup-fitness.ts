import type { PrismaClient } from "@prisma/client";

export async function clearFitnessModule(prisma: PrismaClient) {
  await prisma.attendance.deleteMany();
  await prisma.fitnessCheckIn.deleteMany();
  await prisma.accessPass.deleteMany();
  await prisma.classBooking.deleteMany();
  await prisma.trainingSession.deleteMany();
  await prisma.classSession.deleteMany();
  await prisma.trainerAssignment.deleteMany();
  await prisma.membershipFreeze.deleteMany();
  await prisma.membershipPeriod.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.membershipBenefit.deleteMany();
  await prisma.membershipPlan.deleteMany();
  await prisma.fitnessClass.deleteMany();
  await prisma.classType.deleteMany();
  await prisma.trainer.deleteMany();
  await prisma.memberProfile.deleteMany();
  await prisma.fitnessArea.deleteMany();
  await prisma.fitnessFacility.deleteMany();
}
