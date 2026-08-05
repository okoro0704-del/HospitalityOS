import type { PrismaClient } from "@prisma/client";

/** Clears universal booking-engine tables (order respects FKs). */
export async function clearBookingEngine(prisma: PrismaClient) {
  await prisma.bookingTimeline.deleteMany();
  await prisma.bookingReminder.deleteMany();
  await prisma.bookingConflict.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.bookingItem.deleteMany();
  await prisma.timeSlot.deleteMany();
  await prisma.resourceSchedule.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.resourceAssignment.deleteMany();
  await prisma.blackoutPeriod.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.bookingPolicy.deleteMany();
  // Accommodation reservations may reference Booking — cleared by callers first when needed.
  await prisma.booking.deleteMany();
  await prisma.bookableResource.deleteMany();
  await prisma.resourceCategory.deleteMany();
}
