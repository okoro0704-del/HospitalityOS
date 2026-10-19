-- H0 reconciliation: brings the August 2026 migrations up to the recovered schema.
-- Generated with prisma migrate diff (from migrations to schema) against a disposable
-- PostgreSQL 18 shadow database. Additive only: new tables, columns and indexes; the one
-- relaxation is StaffMember.passwordHash becoming nullable for TrustID-only staff.

-- AlterTable
ALTER TABLE "FitnessFacility" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "GuestSession" ADD COLUMN     "authProvider" TEXT NOT NULL DEFAULT 'lifeos';

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "externalIdentityRef" TEXT,
ADD COLUMN     "trustId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StaffSession" ADD COLUMN     "authProvider" TEXT NOT NULL DEFAULT 'legacy_password',
ADD COLUMN     "stepUpAt" JSONB,
ADD COLUMN     "trustId" TEXT,
ADD COLUMN     "trustJti" TEXT,
ADD COLUMN     "trustSid" TEXT;

-- CreateTable
CREATE TABLE "StaffIdentityLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "trustId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedByStaffId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssertionExchange" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "trustId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tenantId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssertionExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepUpChallenge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffSessionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requiredScopes" JSONB NOT NULL,
    "jti" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "satisfiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepUpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPublication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "audience" TEXT NOT NULL DEFAULT 'public',
    "relatedOfferingId" TEXT,
    "mediaAssetIds" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffIdentityLink_trustId_idx" ON "StaffIdentityLink"("trustId");

-- CreateIndex
CREATE INDEX "StaffIdentityLink_tenantId_status_idx" ON "StaffIdentityLink"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffIdentityLink_tenantId_trustId_key" ON "StaffIdentityLink"("tenantId", "trustId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffIdentityLink_tenantId_staffId_key" ON "StaffIdentityLink"("tenantId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "AssertionExchange_jti_key" ON "AssertionExchange"("jti");

-- CreateIndex
CREATE INDEX "AssertionExchange_expiresAt_idx" ON "AssertionExchange"("expiresAt");

-- CreateIndex
CREATE INDEX "AssertionExchange_trustId_idx" ON "AssertionExchange"("trustId");

-- CreateIndex
CREATE INDEX "StepUpChallenge_tenantId_staffId_status_idx" ON "StepUpChallenge"("tenantId", "staffId", "status");

-- CreateIndex
CREATE INDEX "StepUpChallenge_staffSessionId_idx" ON "StepUpChallenge"("staffSessionId");

-- CreateIndex
CREATE INDEX "BusinessPublication_tenantId_status_publishedAt_idx" ON "BusinessPublication"("tenantId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "BusinessPublication_status_publishedAt_idx" ON "BusinessPublication"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "FitnessFacility_tenantId_branchId_idx" ON "FitnessFacility"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "GuestSession_lifeosSid_idx" ON "GuestSession"("lifeosSid");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_trustId_idx" ON "StaffMember"("tenantId", "trustId");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_externalIdentityRef_idx" ON "StaffMember"("tenantId", "externalIdentityRef");

-- CreateIndex
CREATE INDEX "StaffSession_trustJti_idx" ON "StaffSession"("trustJti");

-- CreateIndex
CREATE INDEX "StaffSession_trustSid_idx" ON "StaffSession"("trustSid");

-- CreateIndex
CREATE INDEX "StaffSession_trustId_idx" ON "StaffSession"("trustId");

-- AddForeignKey
ALTER TABLE "StaffIdentityLink" ADD CONSTRAINT "StaffIdentityLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffIdentityLink" ADD CONSTRAINT "StaffIdentityLink_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepUpChallenge" ADD CONSTRAINT "StepUpChallenge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepUpChallenge" ADD CONSTRAINT "StepUpChallenge_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepUpChallenge" ADD CONSTRAINT "StepUpChallenge_staffSessionId_fkey" FOREIGN KEY ("staffSessionId") REFERENCES "StaffSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPublication" ADD CONSTRAINT "BusinessPublication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

