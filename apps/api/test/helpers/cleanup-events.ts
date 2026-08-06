import type { PrismaClient } from "@prisma/client";

export async function clearEventsModule(prisma: PrismaClient) {
  await prisma.eventCheckIn.deleteMany();
  await prisma.eventWaitlist.deleteMany();
  await prisma.eventAttendee.deleteMany();
  await prisma.eventTicket.deleteMany();
  await prisma.eventTicketType.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.seatSection.deleteMany();
  await prisma.seatingPlan.deleteMany();
  await prisma.eventStaffAssignment.deleteMany();
  await prisma.eventSession.deleteMany();
  await prisma.venueBooking.deleteMany();
  await prisma.eventPackage.deleteMany();
  await prisma.eventAddon.deleteMany();
  await prisma.event.deleteMany();
  await prisma.eventOrganizer.deleteMany();
  await prisma.eventType.deleteMany();
  await prisma.venueArea.deleteMany();
  await prisma.eventVenue.deleteMany();
}
