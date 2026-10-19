-- H0: room-night ledger and reservation idempotency.
--
-- RoomNightAllocation holds one row per (room, night) for every active reservation
-- (pending, confirmed, checked_in). Its unique (roomId, night) index is what makes a
-- double booking impossible, whatever the application does.

-- 1. Refuse to start if active reservations already overlap on a room. Nothing below
--    runs, so the database is left exactly as it was; resolve the listed overlaps first.
DO $$
DECLARE
  overlap_count integer;
BEGIN
  SELECT count(*) INTO overlap_count
  FROM "AccommodationReservation" a
  JOIN "AccommodationReservation" b
    ON a."roomId" = b."roomId"
   AND a."id" < b."id"
   AND a."checkInDate" < b."checkOutDate"
   AND b."checkInDate" < a."checkOutDate"
  WHERE a."roomId" IS NOT NULL
    AND a."status" IN ('pending', 'confirmed', 'checked_in')
    AND b."status" IN ('pending', 'confirmed', 'checked_in');
  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'room-night ledger: % pair(s) of active reservations already share a room on overlapping nights; resolve them before applying this migration', overlap_count;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "AccommodationReservation" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "requestHash" TEXT;

-- CreateTable
CREATE TABLE "RoomNightAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "night" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomNightAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomNightAllocation_tenantId_night_idx" ON "RoomNightAllocation"("tenantId", "night");

-- CreateIndex
CREATE INDEX "RoomNightAllocation_reservationId_idx" ON "RoomNightAllocation"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomNightAllocation_roomId_night_key" ON "RoomNightAllocation"("roomId", "night");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationReservation_tenantId_idempotencyKey_key" ON "AccommodationReservation"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "RoomNightAllocation" ADD CONSTRAINT "RoomNightAllocation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomNightAllocation" ADD CONSTRAINT "RoomNightAllocation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "AccommodationReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2. A night is a calendar day: only UTC midnight is allowed, so the unique index
--    cannot be sidestepped by a different time on the same day.
ALTER TABLE "RoomNightAllocation"
  ADD CONSTRAINT "RoomNightAllocation_night_is_midnight" CHECK ("night" = date_trunc('day', "night"));

-- 3. Backfill the ledger for existing active reservations.
INSERT INTO "RoomNightAllocation" ("id", "tenantId", "roomId", "reservationId", "night")
SELECT 'rna_' || md5(r."id" || ':' || n::text), r."tenantId", r."roomId", r."id", n
FROM "AccommodationReservation" r
CROSS JOIN LATERAL generate_series(
  date_trunc('day', r."checkInDate"),
  date_trunc('day', r."checkOutDate") - interval '1 day',
  interval '1 day'
) AS n
WHERE r."roomId" IS NOT NULL
  AND r."status" IN ('pending', 'confirmed', 'checked_in');
