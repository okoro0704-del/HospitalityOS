-- Additive media privacy columns (Phase Final)
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "contentType" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "byteSize" INTEGER;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "MediaAsset_tenantId_storageKey_idx" ON "MediaAsset"("tenantId", "storageKey");
