import type { PrismaClient } from "@prisma/client";

export async function clearCinemaModule(prisma: PrismaClient) {
  await prisma.cinemaCheckIn.deleteMany();
  await prisma.cinemaWaitlist.deleteMany();
  await prisma.cinemaAttendee.deleteMany();
  await prisma.cinemaTicket.deleteMany();
  await prisma.cinemaTicketType.deleteMany();
  await prisma.cinemaSeatHold.deleteMany();
  await prisma.cinemaSeat.deleteMany();
  await prisma.cinemaSeatSection.deleteMany();
  await prisma.cinemaSeatMap.deleteMany();
  await prisma.cinemaConcessionOrderItem.deleteMany();
  await prisma.cinemaConcessionOrder.deleteMany();
  await prisma.cinemaConcession.deleteMany();
  await prisma.cinemaShift.deleteMany();
  await prisma.cinemaShowtime.deleteMany();
  await prisma.cinemaContent.deleteMany();
  await prisma.cinemaScreen.deleteMany();
  await prisma.cinemaVenue.deleteMany();
}
