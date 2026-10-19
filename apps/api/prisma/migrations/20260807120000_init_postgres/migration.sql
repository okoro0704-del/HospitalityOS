-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "experienceId" TEXT,
    "lifeosBusinessId" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0F766E',
    "secondaryColor" TEXT NOT NULL DEFAULT '#134E4A',
    "accentColor" TEXT NOT NULL DEFAULT '#F59E0B',
    "theme" TEXT NOT NULL DEFAULT 'light',
    "fontFamily" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "operatingHours" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "preferredName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "preferredLanguage" TEXT,
    "timezone" TEXT,
    "lifeosUserId" TEXT,
    "trustId" TEXT,
    "externalIdentityRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "preferences" JSONB NOT NULL,
    "loyaltyPlaceholder" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "branchIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lifeosStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "lifeosJti" TEXT NOT NULL,
    "lifeosSid" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "displayName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "category" TEXT NOT NULL DEFAULT 'system',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'unread',
    "audience" TEXT NOT NULL DEFAULT 'customer',
    "sourceModule" TEXT,
    "sourceEntityId" TEXT,
    "deepLink" TEXT,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "checkInTime" TEXT NOT NULL DEFAULT '15:00',
    "checkOutTime" TEXT NOT NULL DEFAULT '11:00',
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "inheritBranding" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "buildingId" TEXT,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amenity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "icon" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "bedConfiguration" TEXT,
    "baseRate" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "photoUrls" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomTypeAmenity" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,

    CONSTRAINT "RoomTypeAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomTypeId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "buildingId" TEXT,
    "floorId" TEXT,
    "number" TEXT NOT NULL,
    "occupancyStatus" TEXT NOT NULL DEFAULT 'vacant',
    "housekeepingStatus" TEXT NOT NULL DEFAULT 'clean',
    "maintenanceStatus" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAvailability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "roomId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "inventory" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "roomId" TEXT,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "confirmationCode" TEXT NOT NULL,
    "internalNotes" TEXT,
    "guestNotes" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationGuest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'staff',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTimeline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookableResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'available',
    "tags" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "customFields" JSONB NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookableResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "moduleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmationCode" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "internalNotes" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceId" TEXT,
    "moduleId" TEXT,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceId" TEXT,
    "moduleId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "daysOfWeek" JSONB NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "resourceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "booked" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackoutPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceId" TEXT,
    "moduleId" TEXT,
    "name" TEXT NOT NULL,
    "reason" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlackoutPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 365,
    "cancellationDeadlineMinutes" INTEGER NOT NULL DEFAULT 60,
    "lateArrivalGraceMinutes" INTEGER NOT NULL DEFAULT 15,
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 1440,
    "allowWaitlist" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceId" TEXT,
    "moduleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "notes" TEXT,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingConflict" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "assigneeKind" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "role" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingTimeline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Catalog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offering" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "categoryId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "moduleId" TEXT,
    "tags" JSONB NOT NULL,
    "customAttributes" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoSlug" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDetail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "ServiceDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDetail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'each',
    "weight" DOUBLE PRECISION,
    "stockPlaceholder" INTEGER,
    "inventoryItemId" TEXT,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "ProductDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageDetail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "bundlePrice" INTEGER,
    "validityDays" INTEGER,
    "inheritAvailability" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "PackageDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageOfferingId" TEXT NOT NULL,
    "childOfferingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modifier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT,
    "priceListId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "percent" DOUBLE PRECISION,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "daysOfWeek" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "percent" DOUBLE PRECISION,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "channelIds" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "promotionId" TEXT,
    "code" TEXT NOT NULL,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "percent" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "inclusive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Addon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT,
    "addonOfferingId" TEXT,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Addon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingRelation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "relatedOfferingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OfferingRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "bookableResourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AvailabilityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisibilityRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT,
    "channelId" TEXT,
    "ruleType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "VisibilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "CatalogTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingTag" (
    "offeringId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "OfferingTag_pkey" PRIMARY KEY ("offeringId","tagId")
);

-- CreateTable
CREATE TABLE "CatalogLabel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "CatalogLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAttributeDef" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "appliesTo" TEXT NOT NULL DEFAULT 'offering',

    CONSTRAINT "CustomAttributeDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "areaType" TEXT NOT NULL DEFAULT 'indoor',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "diningAreaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "minCapacity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'available',
    "bookableResourceId" TEXT,
    "tableGroupId" TEXT,
    "isOutdoor" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningMenu" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "diningAreaId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "seasonal" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "MenuSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "kitchenStationId" TEXT,
    "courseHint" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "diningAreaId" TEXT,
    "tableId" TEXT,
    "customerId" TEXT,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "partySize" INTEGER NOT NULL DEFAULT 2,
    "seatingAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "confirmationCode" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservationId" TEXT,
    "tableId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "partySize" INTEGER NOT NULL DEFAULT 2,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "DiningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "sessionId" TEXT,
    "reservationId" TEXT,
    "customerId" TEXT,
    "orderType" TEXT NOT NULL DEFAULT 'dine_in',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "serviceCharge" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "billStatus" TEXT NOT NULL DEFAULT 'open',
    "splitCount" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningOrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "course" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "modifiers" JSONB NOT NULL,

    CONSTRAINT "DiningOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kitchenStationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "firedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "shiftId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "ServerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiningShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceChargeRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceChargeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessFacility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitnessFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "areaType" TEXT NOT NULL DEFAULT 'gym_floor',
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,

    CONSTRAINT "FitnessArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facilityId" TEXT,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "price" INTEGER NOT NULL DEFAULT 0,
    "accessRules" JSONB NOT NULL,
    "includedClasses" JSONB NOT NULL,
    "guestPrivileges" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "MembershipPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipFreeze" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "reason" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBenefit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "MembershipBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "emergencyContact" TEXT,
    "notes" TEXT,
    "preferences" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "ClassType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facilityId" TEXT,
    "areaId" TEXT,
    "classTypeId" TEXT,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "membershipRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitnessClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "areaId" TEXT,
    "trainerId" TEXT,
    "bookableResourceId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trainer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "specializations" JSONB NOT NULL,
    "bio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "bookableResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'instructor',
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "TrainerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "offeringId" TEXT,
    "bookingId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "trainingId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'class',
    "status" TEXT NOT NULL DEFAULT 'present',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "notes" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessCheckIn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "facilityId" TEXT,
    "areaId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'gym',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'staff',
    "metadata" JSONB NOT NULL,

    CONSTRAINT "FitnessCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "kind" TEXT NOT NULL,
    "offeringId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "allowedAreas" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaFacility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "roomType" TEXT NOT NULL DEFAULT 'massage',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "compatibleTreatments" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "maintenanceNotes" TEXT,
    "bookableResourceId" TEXT,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "TreatmentRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "areaType" TEXT NOT NULL DEFAULT 'wellness',
    "capacity" INTEGER,
    "membershipRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "bookableResourceId" TEXT,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "WellnessArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "TreatmentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facilityId" TEXT,
    "categoryId" TEXT,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "price" INTEGER NOT NULL DEFAULT 0,
    "requiredRoomTypes" JSONB NOT NULL,
    "requiredSpecialties" JSONB NOT NULL,
    "imageUrls" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentVariant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "TreatmentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaTherapist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "bio" TEXT,
    "workingHours" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "bookableResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaTherapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistSpecialty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "TherapistSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistTreatmentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "TherapistTreatmentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaAppointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "variantId" TEXT,
    "therapistId" TEXT,
    "roomId" TEXT,
    "bookingId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "notes" TEXT,
    "addonOfferingIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaClientProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "allergies" TEXT,
    "sensitivities" TEXT,
    "preferredTherapistId" TEXT,
    "preferences" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaConsultation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "treatmentId" TEXT,
    "consultedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recommendations" TEXT,
    "followUpAt" TIMESTAMP(3),
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaConsultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "therapistId" TEXT,
    "treatmentId" TEXT,
    "completionStatus" TEXT NOT NULL DEFAULT 'completed',
    "generalNotes" TEXT,
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AftercareNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "visibleToGuest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AftercareNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "therapistId" TEXT,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',

    CONSTRAINT "SpaShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessFacilitySession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "customerId" TEXT,
    "bookingId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellnessFacilitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaMembershipPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "price" INTEGER NOT NULL DEFAULT 0,
    "benefits" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaMembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVenue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "venueType" TEXT NOT NULL DEFAULT 'ballroom',
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "location" TEXT,
    "amenities" JSONB NOT NULL,
    "imageUrls" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "bookableResourceId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventVenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 50,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "bookableResourceId" TEXT,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "VenueArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOrganizer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "EventOrganizer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "venueId" TEXT,
    "eventTypeId" TEXT,
    "organizerId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "seatingMode" TEXT NOT NULL DEFAULT 'general_admission',
    "imageUrls" JSONB NOT NULL,
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "venueId" TEXT,
    "areaId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "speakers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "bookableResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "areaId" TEXT,
    "customerId" TEXT,
    "bookingId" TEXT,
    "offeringId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTicketType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "salesStart" TIMESTAMP(3),
    "salesEnd" TIMESTAMP(3),
    "accessRules" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "customerId" TEXT,
    "seatId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "holderName" TEXT,
    "holderEmail" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,

    CONSTRAINT "EventTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "checkInStatus" TEXT NOT NULL DEFAULT 'not_checked_in',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "venueId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "SeatingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seatingPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeatSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rowLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "metadata" JSONB NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "EventPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAddon" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "EventAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStaffAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL DEFAULT 'event_staff',
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "EventStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCheckIn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "attendeeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'checked_in',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'staff',
    "metadata" JSONB NOT NULL,

    CONSTRAINT "EventCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventWaitlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "notes" TEXT,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaVenue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "amenities" JSONB NOT NULL,
    "imageUrls" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CinemaVenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaScreen" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "screenType" TEXT NOT NULL DEFAULT 'standard',
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "amenities" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "seatingMode" TEXT NOT NULL DEFAULT 'assigned',
    "bookableResourceId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CinemaScreen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaSeatMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "CinemaSeatMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaSeatSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seatMapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CinemaSeatSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaSeat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rowLabel" TEXT,
    "seatType" TEXT NOT NULL DEFAULT 'standard',
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'available',
    "holdSessionId" TEXT,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "CinemaSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaContent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "runtimeMinutes" INTEGER NOT NULL DEFAULT 120,
    "genre" TEXT,
    "category" TEXT NOT NULL DEFAULT 'movie',
    "rating" TEXT NOT NULL DEFAULT 'PG',
    "language" TEXT,
    "subtitles" TEXT,
    "releaseDate" TIMESTAMP(3),
    "posterUrl" TEXT,
    "trailerUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CinemaContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaShowtime" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "seatingMode" TEXT NOT NULL DEFAULT 'assigned',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "bookableResourceId" TEXT,
    "bookingId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CinemaShowtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaTicketType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "showtimeId" TEXT NOT NULL,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "salesStart" TIMESTAMP(3),
    "salesEnd" TIMESTAMP(3),
    "accessRules" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CinemaTicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "showtimeId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "customerId" TEXT,
    "seatId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "holderName" TEXT,
    "holderEmail" TEXT,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,

    CONSTRAINT "CinemaTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaSeatHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "showtimeId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "CinemaSeatHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaAttendee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "showtimeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "checkInStatus" TEXT NOT NULL DEFAULT 'not_checked_in',
    "status" TEXT NOT NULL DEFAULT 'registered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CinemaAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaCheckIn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "showtimeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "attendeeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'checked_in',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'staff',
    "metadata" JSONB NOT NULL,

    CONSTRAINT "CinemaCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaWaitlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "showtimeId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "notes" TEXT,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CinemaWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaConcession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "venueId" TEXT,
    "offeringId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'snack',
    "price" INTEGER NOT NULL DEFAULT 0,
    "variants" JSONB NOT NULL,
    "modifiers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CinemaConcession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaConcessionOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "venueId" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CinemaConcessionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaConcessionOrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "concessionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "modifiers" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "CinemaConcessionOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CinemaShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "venueId" TEXT,
    "staffId" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL DEFAULT 'operations',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,

    CONSTRAINT "CinemaShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "InventoryArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxQuantity" DOUBLE PRECISION,
    "reorderPoint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "onHand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "damaged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expired" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'in',
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "balanceAfter" DOUBLE PRECISION,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "transactionId" TEXT,
    "quantityDelta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "outTransactionId" TEXT,
    "inTransactionId" TEXT,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualQty" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReorderRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT,
    "reorderPoint" DOUBLE PRECISION NOT NULL,
    "reorderQuantity" DOUBLE PRECISION NOT NULL,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastAlertAt" TIMESTAMP(3),

    CONSTRAINT "InventoryReorderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySupplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySupplierItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "unitCost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "InventorySupplierItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "requesterId" TEXT,
    "approverId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "purchaseDate" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "staffId" TEXT,
    "assigneeLabel" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OperationalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalTaskComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReorderAlert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT,
    "reorderRuleId" TEXT,
    "onHand" DOUBLE PRECISION NOT NULL,
    "reorderPoint" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "ReorderAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'other',
    "line1" TEXT,
    "line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTagLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTagLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'granted',
    "source" TEXT,
    "policyRef" TEXT,
    "grantedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerInteraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "staffId" TEXT,
    "notes" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "followUpAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "title" TEXT,
    "metadata" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "label" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "CustomerVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "source" TEXT,
    "sourceModule" TEXT,
    "sourceEntityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "source" TEXT,
    "sourceModule" TEXT,
    "sourceEntityId" TEXT,
    "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLoyaltyProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'none',
    "tier" TEXT,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLoyaltyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCommunicationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "emailOptIn" BOOLEAN NOT NULL DEFAULT false,
    "smsOptIn" BOOLEAN NOT NULL DEFAULT false,
    "pushOptIn" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannel" TEXT,
    "metadata" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMergeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceCustomerId" TEXT NOT NULL,
    "destinationCustomerId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerMergeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRelationship" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "relatedCustomerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'related',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "type" TEXT NOT NULL DEFAULT 'transactional',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "templateId" TEXT,
    "channels" JSONB NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'customer',
    "category" TEXT NOT NULL DEFAULT 'system',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "deepLinkTpl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "marketingEmail" BOOLEAN NOT NULL DEFAULT false,
    "marketingSms" BOOLEAN NOT NULL DEFAULT false,
    "marketingPush" BOOLEAN NOT NULL DEFAULT false,
    "transactionalOk" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannelConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "config" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationChannelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventId" TEXT,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "customerId" TEXT,
    "staffUserId" TEXT,
    "metadata" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" TEXT,
    "recipientKind" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "roleHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "notificationId" TEXT,
    "ruleId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "actorKind" TEXT,
    "actorId" TEXT,
    "detail" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageVariable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "MessageVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "actorKind" TEXT,
    "actorId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'NGN',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingTaxRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'vat',
    "jurisdiction" TEXT NOT NULL DEFAULT 'NG',
    "rateBps" INTEGER NOT NULL,
    "inclusive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingTaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingAccountId" TEXT,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "taxTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "amountDue" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceEntityId" TEXT,
    "billableType" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillableItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "billableType" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "invoiceId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillableItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "status" TEXT NOT NULL DEFAULT 'created',
    "idempotencyKey" TEXT NOT NULL,
    "providerRef" TEXT,
    "scenario" TEXT,
    "metadata" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "label" TEXT,
    "last4" TEXT,
    "brand" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "intentId" TEXT,
    "paymentMethodId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "methodType" TEXT NOT NULL DEFAULT 'card',
    "staffId" TEXT,
    "branchId" TEXT,
    "collectedByStaffId" TEXT,
    "verifiedByStaffId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "notes" TEXT,
    "correlationId" TEXT,
    "capturedAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "providerFee" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "metadata" JSONB NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "providerRef" TEXT,
    "idempotencyKey" TEXT,
    "staffId" TEXT,
    "metadata" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "providerRef" TEXT,
    "currency" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "netAmount" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "staffId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT NOT NULL,
    "customerId" TEXT,
    "number" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorKind" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "source" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "token" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdminSession_tokenHash_key" ON "PlatformAdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformAdminSession_adminId_idx" ON "PlatformAdminSession"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_experienceId_key" ON "Tenant"("experienceId");

-- CreateIndex
CREATE INDEX "Tenant_organizationId_idx" ON "Tenant"("organizationId");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_code_key" ON "Branch"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TenantModule_tenantId_idx" ON "TenantModule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantModule_tenantId_moduleId_key" ON "TenantModule"("tenantId", "moduleId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_email_idx" ON "Customer"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Customer_tenantId_phone_idx" ON "Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Customer_tenantId_externalIdentityRef_idx" ON "Customer"("tenantId", "externalIdentityRef");

-- CreateIndex
CREATE INDEX "Customer_tenantId_trustId_idx" ON "Customer"("tenantId", "trustId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_lifeosUserId_key" ON "Customer"("tenantId", "lifeosUserId");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_idx" ON "StaffMember"("tenantId");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_role_idx" ON "StaffMember"("tenantId", "role");

-- CreateIndex
CREATE INDEX "StaffMember_tenantId_status_idx" ON "StaffMember"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_tenantId_email_key" ON "StaffMember"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestSession_tenantId_idx" ON "GuestSession"("tenantId");

-- CreateIndex
CREATE INDEX "GuestSession_lifeosJti_idx" ON "GuestSession"("lifeosJti");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_tenantId_idx" ON "StaffSession"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_audience_status_idx" ON "Notification"("tenantId", "audience", "status");

-- CreateIndex
CREATE INDEX "Notification_tenantId_actorKind_actorId_idx" ON "Notification"("tenantId", "actorKind", "actorId");

-- CreateIndex
CREATE INDEX "Notification_sourceModule_sourceEntityId_idx" ON "Notification"("sourceModule", "sourceEntityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Property_tenantId_idx" ON "Property"("tenantId");

-- CreateIndex
CREATE INDEX "Property_tenantId_branchId_idx" ON "Property"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_tenantId_code_key" ON "Property"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Building_tenantId_idx" ON "Building"("tenantId");

-- CreateIndex
CREATE INDEX "Building_propertyId_idx" ON "Building"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Building_propertyId_code_key" ON "Building"("propertyId", "code");

-- CreateIndex
CREATE INDEX "Floor_tenantId_idx" ON "Floor"("tenantId");

-- CreateIndex
CREATE INDEX "Floor_propertyId_idx" ON "Floor"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_propertyId_level_buildingId_key" ON "Floor"("propertyId", "level", "buildingId");

-- CreateIndex
CREATE INDEX "Amenity_tenantId_idx" ON "Amenity"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Amenity_tenantId_code_key" ON "Amenity"("tenantId", "code");

-- CreateIndex
CREATE INDEX "RoomType_tenantId_idx" ON "RoomType"("tenantId");

-- CreateIndex
CREATE INDEX "RoomType_propertyId_idx" ON "RoomType"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomType_propertyId_code_key" ON "RoomType"("propertyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RoomTypeAmenity_roomTypeId_amenityId_key" ON "RoomTypeAmenity"("roomTypeId", "amenityId");

-- CreateIndex
CREATE INDEX "RatePlan_tenantId_idx" ON "RatePlan"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_propertyId_code_key" ON "RatePlan"("propertyId", "code");

-- CreateIndex
CREATE INDEX "Room_tenantId_idx" ON "Room"("tenantId");

-- CreateIndex
CREATE INDEX "Room_propertyId_idx" ON "Room"("propertyId");

-- CreateIndex
CREATE INDEX "Room_roomTypeId_idx" ON "Room"("roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_propertyId_number_key" ON "Room"("propertyId", "number");

-- CreateIndex
CREATE INDEX "RoomAvailability_tenantId_idx" ON "RoomAvailability"("tenantId");

-- CreateIndex
CREATE INDEX "RoomAvailability_date_idx" ON "RoomAvailability"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RoomAvailability_roomTypeId_roomId_date_key" ON "RoomAvailability"("roomTypeId", "roomId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationReservation_bookingId_key" ON "AccommodationReservation"("bookingId");

-- CreateIndex
CREATE INDEX "AccommodationReservation_tenantId_idx" ON "AccommodationReservation"("tenantId");

-- CreateIndex
CREATE INDEX "AccommodationReservation_propertyId_idx" ON "AccommodationReservation"("propertyId");

-- CreateIndex
CREATE INDEX "AccommodationReservation_customerId_idx" ON "AccommodationReservation"("customerId");

-- CreateIndex
CREATE INDEX "AccommodationReservation_status_idx" ON "AccommodationReservation"("status");

-- CreateIndex
CREATE INDEX "AccommodationReservation_checkInDate_checkOutDate_idx" ON "AccommodationReservation"("checkInDate", "checkOutDate");

-- CreateIndex
CREATE UNIQUE INDEX "AccommodationReservation_tenantId_confirmationCode_key" ON "AccommodationReservation"("tenantId", "confirmationCode");

-- CreateIndex
CREATE INDEX "ReservationGuest_tenantId_idx" ON "ReservationGuest"("tenantId");

-- CreateIndex
CREATE INDEX "ReservationGuest_reservationId_idx" ON "ReservationGuest"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "Stay_reservationId_key" ON "Stay"("reservationId");

-- CreateIndex
CREATE INDEX "Stay_tenantId_idx" ON "Stay"("tenantId");

-- CreateIndex
CREATE INDEX "Stay_roomId_idx" ON "Stay"("roomId");

-- CreateIndex
CREATE INDEX "GuestNote_tenantId_idx" ON "GuestNote"("tenantId");

-- CreateIndex
CREATE INDEX "GuestNote_customerId_idx" ON "GuestNote"("customerId");

-- CreateIndex
CREATE INDEX "ReservationTimeline_tenantId_idx" ON "ReservationTimeline"("tenantId");

-- CreateIndex
CREATE INDEX "ReservationTimeline_reservationId_idx" ON "ReservationTimeline"("reservationId");

-- CreateIndex
CREATE INDEX "ResourceCategory_tenantId_idx" ON "ResourceCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceCategory_tenantId_code_key" ON "ResourceCategory"("tenantId", "code");

-- CreateIndex
CREATE INDEX "BookableResource_tenantId_idx" ON "BookableResource"("tenantId");

-- CreateIndex
CREATE INDEX "BookableResource_moduleId_idx" ON "BookableResource"("moduleId");

-- CreateIndex
CREATE INDEX "BookableResource_categoryId_idx" ON "BookableResource"("categoryId");

-- CreateIndex
CREATE INDEX "BookableResource_status_idx" ON "BookableResource"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BookableResource_tenantId_code_key" ON "BookableResource"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "BookableResource_tenantId_sourceType_sourceId_key" ON "BookableResource"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Booking_tenantId_idx" ON "Booking"("tenantId");

-- CreateIndex
CREATE INDEX "Booking_moduleId_idx" ON "Booking"("moduleId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_startsAt_endsAt_idx" ON "Booking"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_tenantId_confirmationCode_key" ON "Booking"("tenantId", "confirmationCode");

-- CreateIndex
CREATE INDEX "BookingItem_tenantId_idx" ON "BookingItem"("tenantId");

-- CreateIndex
CREATE INDEX "BookingItem_bookingId_idx" ON "BookingItem"("bookingId");

-- CreateIndex
CREATE INDEX "BookingItem_resourceId_idx" ON "BookingItem"("resourceId");

-- CreateIndex
CREATE INDEX "BookingItem_startsAt_endsAt_idx" ON "BookingItem"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AvailabilityRule_tenantId_idx" ON "AvailabilityRule"("tenantId");

-- CreateIndex
CREATE INDEX "AvailabilityRule_resourceId_idx" ON "AvailabilityRule"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceSchedule_tenantId_idx" ON "ResourceSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "ResourceSchedule_resourceId_idx" ON "ResourceSchedule"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceSchedule_kind_idx" ON "ResourceSchedule"("kind");

-- CreateIndex
CREATE INDEX "TimeSlot_tenantId_idx" ON "TimeSlot"("tenantId");

-- CreateIndex
CREATE INDEX "TimeSlot_resourceId_idx" ON "TimeSlot"("resourceId");

-- CreateIndex
CREATE INDEX "TimeSlot_startsAt_endsAt_idx" ON "TimeSlot"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BlackoutPeriod_tenantId_idx" ON "BlackoutPeriod"("tenantId");

-- CreateIndex
CREATE INDEX "BlackoutPeriod_resourceId_idx" ON "BlackoutPeriod"("resourceId");

-- CreateIndex
CREATE INDEX "BlackoutPeriod_startsAt_endsAt_idx" ON "BlackoutPeriod"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Holiday_tenantId_idx" ON "Holiday"("tenantId");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "BookingPolicy_tenantId_idx" ON "BookingPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "BookingPolicy_moduleId_idx" ON "BookingPolicy"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPolicy_tenantId_code_key" ON "BookingPolicy"("tenantId", "code");

-- CreateIndex
CREATE INDEX "WaitlistEntry_tenantId_idx" ON "WaitlistEntry"("tenantId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_idx" ON "WaitlistEntry"("status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_startsAt_endsAt_idx" ON "WaitlistEntry"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BookingConflict_tenantId_idx" ON "BookingConflict"("tenantId");

-- CreateIndex
CREATE INDEX "BookingConflict_bookingId_idx" ON "BookingConflict"("bookingId");

-- CreateIndex
CREATE INDEX "BookingReminder_tenantId_idx" ON "BookingReminder"("tenantId");

-- CreateIndex
CREATE INDEX "BookingReminder_remindAt_idx" ON "BookingReminder"("remindAt");

-- CreateIndex
CREATE INDEX "ResourceAssignment_tenantId_idx" ON "ResourceAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_resourceId_idx" ON "ResourceAssignment"("resourceId");

-- CreateIndex
CREATE INDEX "BookingTimeline_tenantId_idx" ON "BookingTimeline"("tenantId");

-- CreateIndex
CREATE INDEX "BookingTimeline_bookingId_idx" ON "BookingTimeline"("bookingId");

-- CreateIndex
CREATE INDEX "Catalog_tenantId_idx" ON "Catalog"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Catalog_tenantId_code_key" ON "Catalog"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CatalogCategory_tenantId_idx" ON "CatalogCategory"("tenantId");

-- CreateIndex
CREATE INDEX "CatalogCategory_parentId_idx" ON "CatalogCategory"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCategory_catalogId_code_key" ON "CatalogCategory"("catalogId", "code");

-- CreateIndex
CREATE INDEX "Offering_tenantId_idx" ON "Offering"("tenantId");

-- CreateIndex
CREATE INDEX "Offering_catalogId_idx" ON "Offering"("catalogId");

-- CreateIndex
CREATE INDEX "Offering_kind_idx" ON "Offering"("kind");

-- CreateIndex
CREATE INDEX "Offering_status_idx" ON "Offering"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Offering_tenantId_code_key" ON "Offering"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Offering_tenantId_slug_key" ON "Offering"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDetail_offeringId_key" ON "ServiceDetail"("offeringId");

-- CreateIndex
CREATE INDEX "ServiceDetail_tenantId_idx" ON "ServiceDetail"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDetail_offeringId_key" ON "ProductDetail"("offeringId");

-- CreateIndex
CREATE INDEX "ProductDetail_tenantId_idx" ON "ProductDetail"("tenantId");

-- CreateIndex
CREATE INDEX "ProductDetail_sku_idx" ON "ProductDetail"("sku");

-- CreateIndex
CREATE INDEX "ProductDetail_inventoryItemId_idx" ON "ProductDetail"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageDetail_offeringId_key" ON "PackageDetail"("offeringId");

-- CreateIndex
CREATE INDEX "PackageDetail_tenantId_idx" ON "PackageDetail"("tenantId");

-- CreateIndex
CREATE INDEX "PackageItem_tenantId_idx" ON "PackageItem"("tenantId");

-- CreateIndex
CREATE INDEX "PackageItem_packageOfferingId_idx" ON "PackageItem"("packageOfferingId");

-- CreateIndex
CREATE INDEX "Variant_tenantId_idx" ON "Variant"("tenantId");

-- CreateIndex
CREATE INDEX "Variant_offeringId_idx" ON "Variant"("offeringId");

-- CreateIndex
CREATE INDEX "OptionGroup_tenantId_idx" ON "OptionGroup"("tenantId");

-- CreateIndex
CREATE INDEX "OptionGroup_offeringId_idx" ON "OptionGroup"("offeringId");

-- CreateIndex
CREATE INDEX "Option_tenantId_idx" ON "Option"("tenantId");

-- CreateIndex
CREATE INDEX "Option_optionGroupId_idx" ON "Option"("optionGroupId");

-- CreateIndex
CREATE INDEX "Modifier_tenantId_idx" ON "Modifier"("tenantId");

-- CreateIndex
CREATE INDEX "Modifier_offeringId_idx" ON "Modifier"("offeringId");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_idx" ON "MediaAsset"("tenantId");

-- CreateIndex
CREATE INDEX "MediaAsset_offeringId_idx" ON "MediaAsset"("offeringId");

-- CreateIndex
CREATE INDEX "MediaAsset_tenantId_isPublic_idx" ON "MediaAsset"("tenantId", "isPublic");

-- CreateIndex
CREATE INDEX "PriceList_tenantId_idx" ON "PriceList"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_tenantId_code_key" ON "PriceList"("tenantId", "code");

-- CreateIndex
CREATE INDEX "PricingRule_tenantId_idx" ON "PricingRule"("tenantId");

-- CreateIndex
CREATE INDEX "PricingRule_offeringId_idx" ON "PricingRule"("offeringId");

-- CreateIndex
CREATE INDEX "PricingRule_kind_idx" ON "PricingRule"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_tenantId_code_key" ON "PricingRule"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Currency_tenantId_idx" ON "Currency"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_tenantId_code_key" ON "Currency"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Promotion_tenantId_idx" ON "Promotion"("tenantId");

-- CreateIndex
CREATE INDEX "Promotion_status_idx" ON "Promotion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_tenantId_code_key" ON "Promotion"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Coupon_tenantId_idx" ON "Coupon"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_tenantId_code_key" ON "Coupon"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Discount_tenantId_idx" ON "Discount"("tenantId");

-- CreateIndex
CREATE INDEX "Discount_offeringId_idx" ON "Discount"("offeringId");

-- CreateIndex
CREATE INDEX "TaxRule_tenantId_idx" ON "TaxRule"("tenantId");

-- CreateIndex
CREATE INDEX "Addon_tenantId_idx" ON "Addon"("tenantId");

-- CreateIndex
CREATE INDEX "Addon_offeringId_idx" ON "Addon"("offeringId");

-- CreateIndex
CREATE INDEX "OfferingRelation_tenantId_idx" ON "OfferingRelation"("tenantId");

-- CreateIndex
CREATE INDEX "OfferingRelation_offeringId_idx" ON "OfferingRelation"("offeringId");

-- CreateIndex
CREATE INDEX "OfferingRelation_kind_idx" ON "OfferingRelation"("kind");

-- CreateIndex
CREATE INDEX "AvailabilityLink_tenantId_idx" ON "AvailabilityLink"("tenantId");

-- CreateIndex
CREATE INDEX "AvailabilityLink_offeringId_idx" ON "AvailabilityLink"("offeringId");

-- CreateIndex
CREATE INDEX "AvailabilityLink_bookableResourceId_idx" ON "AvailabilityLink"("bookableResourceId");

-- CreateIndex
CREATE INDEX "SalesChannel_tenantId_idx" ON "SalesChannel"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesChannel_tenantId_code_key" ON "SalesChannel"("tenantId", "code");

-- CreateIndex
CREATE INDEX "VisibilityRule_tenantId_idx" ON "VisibilityRule"("tenantId");

-- CreateIndex
CREATE INDEX "CatalogTag_tenantId_idx" ON "CatalogTag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogTag_tenantId_code_key" ON "CatalogTag"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CatalogLabel_tenantId_idx" ON "CatalogLabel"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogLabel_tenantId_name_key" ON "CatalogLabel"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CustomAttributeDef_tenantId_idx" ON "CustomAttributeDef"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomAttributeDef_tenantId_key_key" ON "CustomAttributeDef"("tenantId", "key");

-- CreateIndex
CREATE INDEX "DiningArea_tenantId_idx" ON "DiningArea"("tenantId");

-- CreateIndex
CREATE INDEX "DiningArea_tenantId_branchId_idx" ON "DiningArea"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningArea_tenantId_code_key" ON "DiningArea"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DiningTable_tenantId_idx" ON "DiningTable"("tenantId");

-- CreateIndex
CREATE INDEX "DiningTable_diningAreaId_idx" ON "DiningTable"("diningAreaId");

-- CreateIndex
CREATE INDEX "DiningTable_status_idx" ON "DiningTable"("status");

-- CreateIndex
CREATE INDEX "DiningTable_bookableResourceId_idx" ON "DiningTable"("bookableResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_tenantId_code_key" ON "DiningTable"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TableGroup_tenantId_idx" ON "TableGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TableGroup_tenantId_code_key" ON "TableGroup"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DiningMenu_tenantId_idx" ON "DiningMenu"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningMenu_tenantId_code_key" ON "DiningMenu"("tenantId", "code");

-- CreateIndex
CREATE INDEX "MenuSection_tenantId_idx" ON "MenuSection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuSection_menuId_code_key" ON "MenuSection"("menuId", "code");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItem_offeringId_idx" ON "MenuItem"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_sectionId_code_key" ON "MenuItem"("sectionId", "code");

-- CreateIndex
CREATE INDEX "KitchenStation_tenantId_idx" ON "KitchenStation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_tenantId_code_key" ON "KitchenStation"("tenantId", "code");

-- CreateIndex
CREATE INDEX "DiningReservation_tenantId_idx" ON "DiningReservation"("tenantId");

-- CreateIndex
CREATE INDEX "DiningReservation_tenantId_branchId_idx" ON "DiningReservation"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "DiningReservation_status_idx" ON "DiningReservation"("status");

-- CreateIndex
CREATE INDEX "DiningReservation_seatingAt_idx" ON "DiningReservation"("seatingAt");

-- CreateIndex
CREATE INDEX "DiningReservation_bookingId_idx" ON "DiningReservation"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningReservation_tenantId_confirmationCode_key" ON "DiningReservation"("tenantId", "confirmationCode");

-- CreateIndex
CREATE INDEX "DiningSession_tenantId_idx" ON "DiningSession"("tenantId");

-- CreateIndex
CREATE INDEX "DiningSession_status_idx" ON "DiningSession"("status");

-- CreateIndex
CREATE INDEX "DiningOrder_tenantId_idx" ON "DiningOrder"("tenantId");

-- CreateIndex
CREATE INDEX "DiningOrder_tenantId_branchId_idx" ON "DiningOrder"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "DiningOrder_status_idx" ON "DiningOrder"("status");

-- CreateIndex
CREATE INDEX "DiningOrder_orderType_idx" ON "DiningOrder"("orderType");

-- CreateIndex
CREATE INDEX "DiningOrderItem_tenantId_idx" ON "DiningOrderItem"("tenantId");

-- CreateIndex
CREATE INDEX "DiningOrderItem_orderId_idx" ON "DiningOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "KitchenTicket_tenantId_idx" ON "KitchenTicket"("tenantId");

-- CreateIndex
CREATE INDEX "KitchenTicket_status_idx" ON "KitchenTicket"("status");

-- CreateIndex
CREATE INDEX "KitchenTicket_kitchenStationId_idx" ON "KitchenTicket"("kitchenStationId");

-- CreateIndex
CREATE INDEX "ServerAssignment_tenantId_idx" ON "ServerAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "ServerAssignment_tableId_idx" ON "ServerAssignment"("tableId");

-- CreateIndex
CREATE INDEX "DiningShift_tenantId_idx" ON "DiningShift"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningShift_tenantId_code_key" ON "DiningShift"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ServiceChargeRule_tenantId_idx" ON "ServiceChargeRule"("tenantId");

-- CreateIndex
CREATE INDEX "FitnessFacility_tenantId_idx" ON "FitnessFacility"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FitnessFacility_tenantId_code_key" ON "FitnessFacility"("tenantId", "code");

-- CreateIndex
CREATE INDEX "FitnessArea_tenantId_idx" ON "FitnessArea"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FitnessArea_facilityId_code_key" ON "FitnessArea"("facilityId", "code");

-- CreateIndex
CREATE INDEX "MembershipPlan_tenantId_idx" ON "MembershipPlan"("tenantId");

-- CreateIndex
CREATE INDEX "MembershipPlan_offeringId_idx" ON "MembershipPlan"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_tenantId_code_key" ON "MembershipPlan"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");

-- CreateIndex
CREATE INDEX "Membership_customerId_idx" ON "Membership"("customerId");

-- CreateIndex
CREATE INDEX "Membership_status_idx" ON "Membership"("status");

-- CreateIndex
CREATE INDEX "MembershipPeriod_tenantId_idx" ON "MembershipPeriod"("tenantId");

-- CreateIndex
CREATE INDEX "MembershipPeriod_membershipId_idx" ON "MembershipPeriod"("membershipId");

-- CreateIndex
CREATE INDEX "MembershipFreeze_tenantId_idx" ON "MembershipFreeze"("tenantId");

-- CreateIndex
CREATE INDEX "MembershipFreeze_membershipId_idx" ON "MembershipFreeze"("membershipId");

-- CreateIndex
CREATE INDEX "MembershipBenefit_tenantId_idx" ON "MembershipBenefit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBenefit_planId_code_key" ON "MembershipBenefit"("planId", "code");

-- CreateIndex
CREATE INDEX "MemberProfile_tenantId_idx" ON "MemberProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_tenantId_customerId_key" ON "MemberProfile"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ClassType_tenantId_idx" ON "ClassType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassType_tenantId_code_key" ON "ClassType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "FitnessClass_tenantId_idx" ON "FitnessClass"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FitnessClass_tenantId_code_key" ON "FitnessClass"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ClassSession_tenantId_idx" ON "ClassSession"("tenantId");

-- CreateIndex
CREATE INDEX "ClassSession_startsAt_idx" ON "ClassSession"("startsAt");

-- CreateIndex
CREATE INDEX "ClassSession_bookableResourceId_idx" ON "ClassSession"("bookableResourceId");

-- CreateIndex
CREATE INDEX "ClassBooking_tenantId_idx" ON "ClassBooking"("tenantId");

-- CreateIndex
CREATE INDEX "ClassBooking_sessionId_idx" ON "ClassBooking"("sessionId");

-- CreateIndex
CREATE INDEX "ClassBooking_customerId_idx" ON "ClassBooking"("customerId");

-- CreateIndex
CREATE INDEX "ClassBooking_bookingId_idx" ON "ClassBooking"("bookingId");

-- CreateIndex
CREATE INDEX "Trainer_tenantId_idx" ON "Trainer"("tenantId");

-- CreateIndex
CREATE INDEX "Trainer_staffId_idx" ON "Trainer"("staffId");

-- CreateIndex
CREATE INDEX "TrainerAssignment_tenantId_idx" ON "TrainerAssignment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAssignment_trainerId_classId_key" ON "TrainerAssignment"("trainerId", "classId");

-- CreateIndex
CREATE INDEX "TrainingSession_tenantId_idx" ON "TrainingSession"("tenantId");

-- CreateIndex
CREATE INDEX "TrainingSession_trainerId_idx" ON "TrainingSession"("trainerId");

-- CreateIndex
CREATE INDEX "TrainingSession_customerId_idx" ON "TrainingSession"("customerId");

-- CreateIndex
CREATE INDEX "TrainingSession_bookingId_idx" ON "TrainingSession"("bookingId");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_idx" ON "Attendance"("tenantId");

-- CreateIndex
CREATE INDEX "Attendance_customerId_idx" ON "Attendance"("customerId");

-- CreateIndex
CREATE INDEX "Attendance_sessionId_idx" ON "Attendance"("sessionId");

-- CreateIndex
CREATE INDEX "FitnessCheckIn_tenantId_idx" ON "FitnessCheckIn"("tenantId");

-- CreateIndex
CREATE INDEX "FitnessCheckIn_customerId_idx" ON "FitnessCheckIn"("customerId");

-- CreateIndex
CREATE INDEX "FitnessCheckIn_checkedInAt_idx" ON "FitnessCheckIn"("checkedInAt");

-- CreateIndex
CREATE INDEX "AccessPass_tenantId_idx" ON "AccessPass"("tenantId");

-- CreateIndex
CREATE INDEX "AccessPass_customerId_idx" ON "AccessPass"("customerId");

-- CreateIndex
CREATE INDEX "AccessPass_status_idx" ON "AccessPass"("status");

-- CreateIndex
CREATE INDEX "SpaFacility_tenantId_idx" ON "SpaFacility"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaFacility_tenantId_code_key" ON "SpaFacility"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TreatmentRoom_tenantId_idx" ON "TreatmentRoom"("tenantId");

-- CreateIndex
CREATE INDEX "TreatmentRoom_bookableResourceId_idx" ON "TreatmentRoom"("bookableResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentRoom_facilityId_code_key" ON "TreatmentRoom"("facilityId", "code");

-- CreateIndex
CREATE INDEX "WellnessArea_tenantId_idx" ON "WellnessArea"("tenantId");

-- CreateIndex
CREATE INDEX "WellnessArea_bookableResourceId_idx" ON "WellnessArea"("bookableResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "WellnessArea_facilityId_code_key" ON "WellnessArea"("facilityId", "code");

-- CreateIndex
CREATE INDEX "TreatmentCategory_tenantId_idx" ON "TreatmentCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentCategory_tenantId_code_key" ON "TreatmentCategory"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Treatment_tenantId_idx" ON "Treatment"("tenantId");

-- CreateIndex
CREATE INDEX "Treatment_offeringId_idx" ON "Treatment"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "Treatment_tenantId_code_key" ON "Treatment"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TreatmentVariant_tenantId_idx" ON "TreatmentVariant"("tenantId");

-- CreateIndex
CREATE INDEX "TreatmentVariant_offeringId_idx" ON "TreatmentVariant"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentVariant_treatmentId_code_key" ON "TreatmentVariant"("treatmentId", "code");

-- CreateIndex
CREATE INDEX "SpaTherapist_tenantId_idx" ON "SpaTherapist"("tenantId");

-- CreateIndex
CREATE INDEX "SpaTherapist_staffId_idx" ON "SpaTherapist"("staffId");

-- CreateIndex
CREATE INDEX "SpaTherapist_bookableResourceId_idx" ON "SpaTherapist"("bookableResourceId");

-- CreateIndex
CREATE INDEX "TherapistSpecialty_tenantId_idx" ON "TherapistSpecialty"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistSpecialty_therapistId_code_key" ON "TherapistSpecialty"("therapistId", "code");

-- CreateIndex
CREATE INDEX "TherapistTreatmentLink_tenantId_idx" ON "TherapistTreatmentLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistTreatmentLink_therapistId_treatmentId_key" ON "TherapistTreatmentLink"("therapistId", "treatmentId");

-- CreateIndex
CREATE INDEX "SpaAppointment_tenantId_idx" ON "SpaAppointment"("tenantId");

-- CreateIndex
CREATE INDEX "SpaAppointment_tenantId_branchId_idx" ON "SpaAppointment"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "SpaAppointment_customerId_idx" ON "SpaAppointment"("customerId");

-- CreateIndex
CREATE INDEX "SpaAppointment_startsAt_idx" ON "SpaAppointment"("startsAt");

-- CreateIndex
CREATE INDEX "SpaAppointment_bookingId_idx" ON "SpaAppointment"("bookingId");

-- CreateIndex
CREATE INDEX "SpaAppointment_status_idx" ON "SpaAppointment"("status");

-- CreateIndex
CREATE INDEX "SpaClientProfile_tenantId_idx" ON "SpaClientProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaClientProfile_tenantId_customerId_key" ON "SpaClientProfile"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "SpaConsultation_tenantId_idx" ON "SpaConsultation"("tenantId");

-- CreateIndex
CREATE INDEX "SpaConsultation_customerId_idx" ON "SpaConsultation"("customerId");

-- CreateIndex
CREATE INDEX "TreatmentNote_tenantId_idx" ON "TreatmentNote"("tenantId");

-- CreateIndex
CREATE INDEX "TreatmentNote_appointmentId_idx" ON "TreatmentNote"("appointmentId");

-- CreateIndex
CREATE INDEX "AftercareNote_tenantId_idx" ON "AftercareNote"("tenantId");

-- CreateIndex
CREATE INDEX "AftercareNote_appointmentId_idx" ON "AftercareNote"("appointmentId");

-- CreateIndex
CREATE INDEX "AftercareNote_customerId_idx" ON "AftercareNote"("customerId");

-- CreateIndex
CREATE INDEX "SpaShift_tenantId_idx" ON "SpaShift"("tenantId");

-- CreateIndex
CREATE INDEX "SpaShift_startsAt_idx" ON "SpaShift"("startsAt");

-- CreateIndex
CREATE INDEX "WellnessFacilitySession_tenantId_idx" ON "WellnessFacilitySession"("tenantId");

-- CreateIndex
CREATE INDEX "WellnessFacilitySession_areaId_idx" ON "WellnessFacilitySession"("areaId");

-- CreateIndex
CREATE INDEX "WellnessFacilitySession_bookingId_idx" ON "WellnessFacilitySession"("bookingId");

-- CreateIndex
CREATE INDEX "SpaMembershipPlan_tenantId_idx" ON "SpaMembershipPlan"("tenantId");

-- CreateIndex
CREATE INDEX "SpaMembershipPlan_offeringId_idx" ON "SpaMembershipPlan"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaMembershipPlan_tenantId_code_key" ON "SpaMembershipPlan"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SpaMembership_tenantId_idx" ON "SpaMembership"("tenantId");

-- CreateIndex
CREATE INDEX "SpaMembership_customerId_idx" ON "SpaMembership"("customerId");

-- CreateIndex
CREATE INDEX "SpaMembership_status_idx" ON "SpaMembership"("status");

-- CreateIndex
CREATE INDEX "SpaPackage_tenantId_idx" ON "SpaPackage"("tenantId");

-- CreateIndex
CREATE INDEX "SpaPackage_offeringId_idx" ON "SpaPackage"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaPackage_tenantId_code_key" ON "SpaPackage"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EventVenue_tenantId_idx" ON "EventVenue"("tenantId");

-- CreateIndex
CREATE INDEX "EventVenue_bookableResourceId_idx" ON "EventVenue"("bookableResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EventVenue_tenantId_code_key" ON "EventVenue"("tenantId", "code");

-- CreateIndex
CREATE INDEX "VenueArea_tenantId_idx" ON "VenueArea"("tenantId");

-- CreateIndex
CREATE INDEX "VenueArea_bookableResourceId_idx" ON "VenueArea"("bookableResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueArea_venueId_code_key" ON "VenueArea"("venueId", "code");

-- CreateIndex
CREATE INDEX "EventType_tenantId_idx" ON "EventType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_tenantId_code_key" ON "EventType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EventOrganizer_tenantId_idx" ON "EventOrganizer"("tenantId");

-- CreateIndex
CREATE INDEX "Event_tenantId_idx" ON "Event"("tenantId");

-- CreateIndex
CREATE INDEX "Event_tenantId_branchId_idx" ON "Event"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_tenantId_code_key" ON "Event"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EventSession_tenantId_idx" ON "EventSession"("tenantId");

-- CreateIndex
CREATE INDEX "EventSession_startsAt_idx" ON "EventSession"("startsAt");

-- CreateIndex
CREATE INDEX "EventSession_bookableResourceId_idx" ON "EventSession"("bookableResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSession_eventId_code_key" ON "EventSession"("eventId", "code");

-- CreateIndex
CREATE INDEX "VenueBooking_tenantId_idx" ON "VenueBooking"("tenantId");

-- CreateIndex
CREATE INDEX "VenueBooking_venueId_idx" ON "VenueBooking"("venueId");

-- CreateIndex
CREATE INDEX "VenueBooking_bookingId_idx" ON "VenueBooking"("bookingId");

-- CreateIndex
CREATE INDEX "VenueBooking_startsAt_idx" ON "VenueBooking"("startsAt");

-- CreateIndex
CREATE INDEX "EventTicketType_tenantId_idx" ON "EventTicketType"("tenantId");

-- CreateIndex
CREATE INDEX "EventTicketType_offeringId_idx" ON "EventTicketType"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTicketType_eventId_code_key" ON "EventTicketType"("eventId", "code");

-- CreateIndex
CREATE INDEX "EventTicket_tenantId_idx" ON "EventTicket"("tenantId");

-- CreateIndex
CREATE INDEX "EventTicket_eventId_idx" ON "EventTicket"("eventId");

-- CreateIndex
CREATE INDEX "EventTicket_ticketTypeId_idx" ON "EventTicket"("ticketTypeId");

-- CreateIndex
CREATE INDEX "EventTicket_customerId_idx" ON "EventTicket"("customerId");

-- CreateIndex
CREATE INDEX "EventTicket_seatId_idx" ON "EventTicket"("seatId");

-- CreateIndex
CREATE INDEX "EventTicket_status_idx" ON "EventTicket"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendee_ticketId_key" ON "EventAttendee"("ticketId");

-- CreateIndex
CREATE INDEX "EventAttendee_tenantId_idx" ON "EventAttendee"("tenantId");

-- CreateIndex
CREATE INDEX "EventAttendee_eventId_idx" ON "EventAttendee"("eventId");

-- CreateIndex
CREATE INDEX "EventAttendee_customerId_idx" ON "EventAttendee"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatingPlan_eventId_key" ON "SeatingPlan"("eventId");

-- CreateIndex
CREATE INDEX "SeatingPlan_tenantId_idx" ON "SeatingPlan"("tenantId");

-- CreateIndex
CREATE INDEX "SeatSection_tenantId_idx" ON "SeatSection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatSection_seatingPlanId_code_key" ON "SeatSection"("seatingPlanId", "code");

-- CreateIndex
CREATE INDEX "Seat_tenantId_idx" ON "Seat"("tenantId");

-- CreateIndex
CREATE INDEX "Seat_status_idx" ON "Seat"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_sectionId_label_key" ON "Seat"("sectionId", "label");

-- CreateIndex
CREATE INDEX "EventPackage_tenantId_idx" ON "EventPackage"("tenantId");

-- CreateIndex
CREATE INDEX "EventPackage_offeringId_idx" ON "EventPackage"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPackage_tenantId_code_key" ON "EventPackage"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EventAddon_tenantId_idx" ON "EventAddon"("tenantId");

-- CreateIndex
CREATE INDEX "EventAddon_offeringId_idx" ON "EventAddon"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAddon_tenantId_code_key" ON "EventAddon"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EventStaffAssignment_tenantId_idx" ON "EventStaffAssignment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EventStaffAssignment_eventId_staffId_key" ON "EventStaffAssignment"("eventId", "staffId");

-- CreateIndex
CREATE INDEX "EventCheckIn_tenantId_idx" ON "EventCheckIn"("tenantId");

-- CreateIndex
CREATE INDEX "EventCheckIn_eventId_idx" ON "EventCheckIn"("eventId");

-- CreateIndex
CREATE INDEX "EventCheckIn_ticketId_idx" ON "EventCheckIn"("ticketId");

-- CreateIndex
CREATE INDEX "EventWaitlist_tenantId_idx" ON "EventWaitlist"("tenantId");

-- CreateIndex
CREATE INDEX "EventWaitlist_eventId_idx" ON "EventWaitlist"("eventId");

-- CreateIndex
CREATE INDEX "EventWaitlist_customerId_idx" ON "EventWaitlist"("customerId");

-- CreateIndex
CREATE INDEX "EventWaitlist_status_idx" ON "EventWaitlist"("status");

-- CreateIndex
CREATE INDEX "CinemaVenue_tenantId_idx" ON "CinemaVenue"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaVenue_tenantId_branchId_idx" ON "CinemaVenue"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaVenue_tenantId_code_key" ON "CinemaVenue"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CinemaScreen_tenantId_idx" ON "CinemaScreen"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaScreen_bookableResourceId_idx" ON "CinemaScreen"("bookableResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaScreen_venueId_code_key" ON "CinemaScreen"("venueId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaSeatMap_screenId_key" ON "CinemaSeatMap"("screenId");

-- CreateIndex
CREATE INDEX "CinemaSeatMap_tenantId_idx" ON "CinemaSeatMap"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaSeatSection_tenantId_idx" ON "CinemaSeatSection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaSeatSection_seatMapId_code_key" ON "CinemaSeatSection"("seatMapId", "code");

-- CreateIndex
CREATE INDEX "CinemaSeat_tenantId_idx" ON "CinemaSeat"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaSeat_status_idx" ON "CinemaSeat"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaSeat_sectionId_label_key" ON "CinemaSeat"("sectionId", "label");

-- CreateIndex
CREATE INDEX "CinemaContent_tenantId_idx" ON "CinemaContent"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaContent_status_idx" ON "CinemaContent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaContent_tenantId_code_key" ON "CinemaContent"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CinemaShowtime_tenantId_idx" ON "CinemaShowtime"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaShowtime_contentId_idx" ON "CinemaShowtime"("contentId");

-- CreateIndex
CREATE INDEX "CinemaShowtime_screenId_idx" ON "CinemaShowtime"("screenId");

-- CreateIndex
CREATE INDEX "CinemaShowtime_startsAt_idx" ON "CinemaShowtime"("startsAt");

-- CreateIndex
CREATE INDEX "CinemaShowtime_status_idx" ON "CinemaShowtime"("status");

-- CreateIndex
CREATE INDEX "CinemaShowtime_bookableResourceId_idx" ON "CinemaShowtime"("bookableResourceId");

-- CreateIndex
CREATE INDEX "CinemaTicketType_tenantId_idx" ON "CinemaTicketType"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaTicketType_offeringId_idx" ON "CinemaTicketType"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaTicketType_showtimeId_code_key" ON "CinemaTicketType"("showtimeId", "code");

-- CreateIndex
CREATE INDEX "CinemaTicket_tenantId_idx" ON "CinemaTicket"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaTicket_showtimeId_idx" ON "CinemaTicket"("showtimeId");

-- CreateIndex
CREATE INDEX "CinemaTicket_ticketTypeId_idx" ON "CinemaTicket"("ticketTypeId");

-- CreateIndex
CREATE INDEX "CinemaTicket_customerId_idx" ON "CinemaTicket"("customerId");

-- CreateIndex
CREATE INDEX "CinemaTicket_seatId_idx" ON "CinemaTicket"("seatId");

-- CreateIndex
CREATE INDEX "CinemaTicket_status_idx" ON "CinemaTicket"("status");

-- CreateIndex
CREATE INDEX "CinemaSeatHold_tenantId_idx" ON "CinemaSeatHold"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaSeatHold_showtimeId_idx" ON "CinemaSeatHold"("showtimeId");

-- CreateIndex
CREATE INDEX "CinemaSeatHold_seatId_idx" ON "CinemaSeatHold"("seatId");

-- CreateIndex
CREATE INDEX "CinemaSeatHold_sessionKey_idx" ON "CinemaSeatHold"("sessionKey");

-- CreateIndex
CREATE INDEX "CinemaSeatHold_status_idx" ON "CinemaSeatHold"("status");

-- CreateIndex
CREATE INDEX "CinemaSeatHold_expiresAt_idx" ON "CinemaSeatHold"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaAttendee_ticketId_key" ON "CinemaAttendee"("ticketId");

-- CreateIndex
CREATE INDEX "CinemaAttendee_tenantId_idx" ON "CinemaAttendee"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaAttendee_showtimeId_idx" ON "CinemaAttendee"("showtimeId");

-- CreateIndex
CREATE INDEX "CinemaAttendee_customerId_idx" ON "CinemaAttendee"("customerId");

-- CreateIndex
CREATE INDEX "CinemaCheckIn_tenantId_idx" ON "CinemaCheckIn"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaCheckIn_showtimeId_idx" ON "CinemaCheckIn"("showtimeId");

-- CreateIndex
CREATE INDEX "CinemaCheckIn_ticketId_idx" ON "CinemaCheckIn"("ticketId");

-- CreateIndex
CREATE INDEX "CinemaWaitlist_tenantId_idx" ON "CinemaWaitlist"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaWaitlist_showtimeId_idx" ON "CinemaWaitlist"("showtimeId");

-- CreateIndex
CREATE INDEX "CinemaWaitlist_customerId_idx" ON "CinemaWaitlist"("customerId");

-- CreateIndex
CREATE INDEX "CinemaWaitlist_status_idx" ON "CinemaWaitlist"("status");

-- CreateIndex
CREATE INDEX "CinemaConcession_tenantId_idx" ON "CinemaConcession"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaConcession_venueId_idx" ON "CinemaConcession"("venueId");

-- CreateIndex
CREATE INDEX "CinemaConcession_offeringId_idx" ON "CinemaConcession"("offeringId");

-- CreateIndex
CREATE UNIQUE INDEX "CinemaConcession_tenantId_code_key" ON "CinemaConcession"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CinemaConcessionOrder_tenantId_idx" ON "CinemaConcessionOrder"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaConcessionOrder_venueId_idx" ON "CinemaConcessionOrder"("venueId");

-- CreateIndex
CREATE INDEX "CinemaConcessionOrder_customerId_idx" ON "CinemaConcessionOrder"("customerId");

-- CreateIndex
CREATE INDEX "CinemaConcessionOrder_status_idx" ON "CinemaConcessionOrder"("status");

-- CreateIndex
CREATE INDEX "CinemaConcessionOrderItem_tenantId_idx" ON "CinemaConcessionOrderItem"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaConcessionOrderItem_orderId_idx" ON "CinemaConcessionOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "CinemaShift_tenantId_idx" ON "CinemaShift"("tenantId");

-- CreateIndex
CREATE INDEX "CinemaShift_venueId_idx" ON "CinemaShift"("venueId");

-- CreateIndex
CREATE INDEX "CinemaShift_staffId_idx" ON "CinemaShift"("staffId");

-- CreateIndex
CREATE INDEX "CinemaShift_status_idx" ON "CinemaShift"("status");

-- CreateIndex
CREATE INDEX "InventoryLocation_tenantId_idx" ON "InventoryLocation"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryLocation_tenantId_branchId_idx" ON "InventoryLocation"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "InventoryLocation_parentId_idx" ON "InventoryLocation"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_tenantId_code_key" ON "InventoryLocation"("tenantId", "code");

-- CreateIndex
CREATE INDEX "InventoryArea_tenantId_idx" ON "InventoryArea"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryArea_locationId_code_key" ON "InventoryArea"("locationId", "code");

-- CreateIndex
CREATE INDEX "InventoryCategory_tenantId_idx" ON "InventoryCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_tenantId_code_key" ON "InventoryCategory"("tenantId", "code");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");

-- CreateIndex
CREATE INDEX "InventoryItem_status_idx" ON "InventoryItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_sku_key" ON "InventoryItem"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "InventoryBalance_tenantId_idx" ON "InventoryBalance"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryBalance_itemId_idx" ON "InventoryBalance"("itemId");

-- CreateIndex
CREATE INDEX "InventoryBalance_locationId_idx" ON "InventoryBalance"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_tenantId_itemId_locationId_key" ON "InventoryBalance"("tenantId", "itemId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_tenantId_idx" ON "InventoryTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_itemId_idx" ON "InventoryTransaction"("itemId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_locationId_idx" ON "InventoryTransaction"("locationId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_idx" ON "InventoryTransaction"("type");

-- CreateIndex
CREATE INDEX "InventoryTransaction_createdAt_idx" ON "InventoryTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_tenantId_idx" ON "InventoryAdjustment"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_itemId_idx" ON "InventoryAdjustment"("itemId");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_transactionId_idx" ON "InventoryAdjustment"("transactionId");

-- CreateIndex
CREATE INDEX "InventoryMovement_tenantId_idx" ON "InventoryMovement"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_idx" ON "InventoryMovement"("itemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_fromLocationId_idx" ON "InventoryMovement"("fromLocationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_toLocationId_idx" ON "InventoryMovement"("toLocationId");

-- CreateIndex
CREATE INDEX "StockCount_tenantId_idx" ON "StockCount"("tenantId");

-- CreateIndex
CREATE INDEX "StockCount_locationId_idx" ON "StockCount"("locationId");

-- CreateIndex
CREATE INDEX "StockCount_status_idx" ON "StockCount"("status");

-- CreateIndex
CREATE INDEX "StockCountItem_tenantId_idx" ON "StockCountItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountItem_stockCountId_itemId_key" ON "StockCountItem"("stockCountId", "itemId");

-- CreateIndex
CREATE INDEX "InventoryReorderRule_tenantId_idx" ON "InventoryReorderRule"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryReorderRule_itemId_idx" ON "InventoryReorderRule"("itemId");

-- CreateIndex
CREATE INDEX "InventoryReorderRule_status_idx" ON "InventoryReorderRule"("status");

-- CreateIndex
CREATE INDEX "InventorySupplier_tenantId_idx" ON "InventorySupplier"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySupplier_tenantId_code_key" ON "InventorySupplier"("tenantId", "code");

-- CreateIndex
CREATE INDEX "InventorySupplierItem_tenantId_idx" ON "InventorySupplierItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySupplierItem_supplierId_itemId_key" ON "InventorySupplierItem"("supplierId", "itemId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_tenantId_idx" ON "PurchaseRequest"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_supplierId_idx" ON "PurchaseRequest"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_tenantId_idx" ON "PurchaseRequestItem"("tenantId");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_requestId_idx" ON "PurchaseRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_itemId_idx" ON "PurchaseRequestItem"("itemId");

-- CreateIndex
CREATE INDEX "OperationalAsset_tenantId_idx" ON "OperationalAsset"("tenantId");

-- CreateIndex
CREATE INDEX "OperationalAsset_status_idx" ON "OperationalAsset"("status");

-- CreateIndex
CREATE INDEX "OperationalAsset_locationId_idx" ON "OperationalAsset"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalAsset_tenantId_code_key" ON "OperationalAsset"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AssetCategory_tenantId_idx" ON "AssetCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_tenantId_code_key" ON "AssetCategory"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AssetAssignment_tenantId_idx" ON "AssetAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "AssetAssignment_assetId_idx" ON "AssetAssignment"("assetId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_tenantId_idx" ON "MaintenanceRecord"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_assetId_idx" ON "MaintenanceRecord"("assetId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_status_idx" ON "MaintenanceRecord"("status");

-- CreateIndex
CREATE INDEX "OperationalTask_tenantId_idx" ON "OperationalTask"("tenantId");

-- CreateIndex
CREATE INDEX "OperationalTask_status_idx" ON "OperationalTask"("status");

-- CreateIndex
CREATE INDEX "OperationalTask_assigneeId_idx" ON "OperationalTask"("assigneeId");

-- CreateIndex
CREATE INDEX "OperationalTask_relatedEntityType_relatedEntityId_idx" ON "OperationalTask"("relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "OperationalTaskComment_tenantId_idx" ON "OperationalTaskComment"("tenantId");

-- CreateIndex
CREATE INDEX "OperationalTaskComment_taskId_idx" ON "OperationalTaskComment"("taskId");

-- CreateIndex
CREATE INDEX "ReorderAlert_tenantId_idx" ON "ReorderAlert"("tenantId");

-- CreateIndex
CREATE INDEX "ReorderAlert_itemId_idx" ON "ReorderAlert"("itemId");

-- CreateIndex
CREATE INDEX "ReorderAlert_status_idx" ON "ReorderAlert"("status");

-- CreateIndex
CREATE INDEX "CustomerContact_tenantId_idx" ON "CustomerContact"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAddress_tenantId_idx" ON "CustomerAddress"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

-- CreateIndex
CREATE INDEX "CustomerPreference_tenantId_idx" ON "CustomerPreference"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerPreference_customerId_idx" ON "CustomerPreference"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPreference_customerId_moduleId_key_key" ON "CustomerPreference"("customerId", "moduleId", "key");

-- CreateIndex
CREATE INDEX "CustomerTag_tenantId_idx" ON "CustomerTag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_tenantId_code_key" ON "CustomerTag"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CustomerTagLink_tenantId_idx" ON "CustomerTagLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTagLink_customerId_tagId_key" ON "CustomerTagLink"("customerId", "tagId");

-- CreateIndex
CREATE INDEX "CustomerNote_tenantId_idx" ON "CustomerNote"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerNote_customerId_idx" ON "CustomerNote"("customerId");

-- CreateIndex
CREATE INDEX "CustomerConsent_tenantId_idx" ON "CustomerConsent"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerConsent_customerId_idx" ON "CustomerConsent"("customerId");

-- CreateIndex
CREATE INDEX "CustomerConsent_purpose_idx" ON "CustomerConsent"("purpose");

-- CreateIndex
CREATE INDEX "CustomerSegment_tenantId_idx" ON "CustomerSegment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSegment_tenantId_code_key" ON "CustomerSegment"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CustomerInteraction_tenantId_idx" ON "CustomerInteraction"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerInteraction_customerId_idx" ON "CustomerInteraction"("customerId");

-- CreateIndex
CREATE INDEX "CustomerInteraction_occurredAt_idx" ON "CustomerInteraction"("occurredAt");

-- CreateIndex
CREATE INDEX "CustomerEvent_tenantId_idx" ON "CustomerEvent"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerEvent_customerId_idx" ON "CustomerEvent"("customerId");

-- CreateIndex
CREATE INDEX "CustomerEvent_eventType_idx" ON "CustomerEvent"("eventType");

-- CreateIndex
CREATE INDEX "CustomerEvent_occurredAt_idx" ON "CustomerEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "CustomerEvent_sourceModule_sourceEntityId_idx" ON "CustomerEvent"("sourceModule", "sourceEntityId");

-- CreateIndex
CREATE INDEX "CustomerVisit_tenantId_idx" ON "CustomerVisit"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerVisit_customerId_idx" ON "CustomerVisit"("customerId");

-- CreateIndex
CREATE INDEX "CustomerVisit_visitedAt_idx" ON "CustomerVisit"("visitedAt");

-- CreateIndex
CREATE INDEX "CustomerFeedback_tenantId_idx" ON "CustomerFeedback"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerFeedback_customerId_idx" ON "CustomerFeedback"("customerId");

-- CreateIndex
CREATE INDEX "CustomerFeedback_status_idx" ON "CustomerFeedback"("status");

-- CreateIndex
CREATE INDEX "CustomerReview_tenantId_idx" ON "CustomerReview"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerReview_customerId_idx" ON "CustomerReview"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLoyaltyProfile_customerId_key" ON "CustomerLoyaltyProfile"("customerId");

-- CreateIndex
CREATE INDEX "CustomerLoyaltyProfile_tenantId_idx" ON "CustomerLoyaltyProfile"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerLoyaltyProfile_status_idx" ON "CustomerLoyaltyProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCommunicationPreference_customerId_key" ON "CustomerCommunicationPreference"("customerId");

-- CreateIndex
CREATE INDEX "CustomerCommunicationPreference_tenantId_idx" ON "CustomerCommunicationPreference"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerMergeRequest_tenantId_idx" ON "CustomerMergeRequest"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerMergeRequest_status_idx" ON "CustomerMergeRequest"("status");

-- CreateIndex
CREATE INDEX "CustomerRelationship_tenantId_idx" ON "CustomerRelationship"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerRelationship_customerId_idx" ON "CustomerRelationship"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRelationship_customerId_relatedCustomerId_type_key" ON "CustomerRelationship"("customerId", "relatedCustomerId", "type");

-- CreateIndex
CREATE INDEX "NotificationTemplate_tenantId_idx" ON "NotificationTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationTemplate_tenantId_code_idx" ON "NotificationTemplate"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_tenantId_code_version_key" ON "NotificationTemplate"("tenantId", "code", "version");

-- CreateIndex
CREATE INDEX "NotificationRule_tenantId_idx" ON "NotificationRule"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationRule_tenantId_eventType_idx" ON "NotificationRule"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "NotificationRule_enabled_idx" ON "NotificationRule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRule_tenantId_code_key" ON "NotificationRule"("tenantId", "code");

-- CreateIndex
CREATE INDEX "NotificationPreference_tenantId_idx" ON "NotificationPreference"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_tenantId_recipientKind_recipientId_key" ON "NotificationPreference"("tenantId", "recipientKind", "recipientId");

-- CreateIndex
CREATE INDEX "NotificationChannelConfig_tenantId_idx" ON "NotificationChannelConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannelConfig_tenantId_channel_key" ON "NotificationChannelConfig"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_tenantId_idx" ON "NotificationDelivery"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_tenantId_idempotencyKey_key" ON "NotificationDelivery"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationEvent_tenantId_idx" ON "NotificationEvent"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationEvent_eventType_idx" ON "NotificationEvent"("eventType");

-- CreateIndex
CREATE INDEX "NotificationEvent_sourceModule_sourceEntityId_idx" ON "NotificationEvent"("sourceModule", "sourceEntityId");

-- CreateIndex
CREATE INDEX "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_idx" ON "NotificationRecipient"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_recipientKind_recipientId_idx" ON "NotificationRecipient"("recipientKind", "recipientId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_notificationId_idx" ON "NotificationRecipient"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationSchedule_tenantId_idx" ON "NotificationSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationSchedule_scheduledAt_status_idx" ON "NotificationSchedule"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "NotificationSchedule_status_idx" ON "NotificationSchedule"("status");

-- CreateIndex
CREATE INDEX "CommunicationLog_tenantId_idx" ON "CommunicationLog"("tenantId");

-- CreateIndex
CREATE INDEX "CommunicationLog_createdAt_idx" ON "CommunicationLog"("createdAt");

-- CreateIndex
CREATE INDEX "MessageVariable_key_idx" ON "MessageVariable"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MessageVariable_tenantId_key_key" ON "MessageVariable"("tenantId", "key");

-- CreateIndex
CREATE INDEX "NotificationAuditEvent_tenantId_idx" ON "NotificationAuditEvent"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationAuditEvent_createdAt_idx" ON "NotificationAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentCustomer_tenantId_idx" ON "PaymentCustomer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCustomer_tenantId_customerId_key" ON "PaymentCustomer"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "BillingAccount_tenantId_idx" ON "BillingAccount"("tenantId");

-- CreateIndex
CREATE INDEX "BillingAccount_customerId_idx" ON "BillingAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_tenantId_customerId_currency_key" ON "BillingAccount"("tenantId", "customerId", "currency");

-- CreateIndex
CREATE INDEX "BillingTaxRule_tenantId_idx" ON "BillingTaxRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTaxRule_tenantId_code_key" ON "BillingTaxRule"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_tenantId_idx" ON "InvoiceLine"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_sourceModule_sourceEntityId_idx" ON "InvoiceLine"("sourceModule", "sourceEntityId");

-- CreateIndex
CREATE INDEX "BillableItem_tenantId_idx" ON "BillableItem"("tenantId");

-- CreateIndex
CREATE INDEX "BillableItem_customerId_idx" ON "BillableItem"("customerId");

-- CreateIndex
CREATE INDEX "BillableItem_status_idx" ON "BillableItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BillableItem_tenantId_sourceModule_sourceEntityId_key" ON "BillableItem"("tenantId", "sourceModule", "sourceEntityId");

-- CreateIndex
CREATE INDEX "PaymentIntent_tenantId_idx" ON "PaymentIntent"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentIntent_invoiceId_idx" ON "PaymentIntent"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_tenantId_idempotencyKey_key" ON "PaymentIntent"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentMethod_tenantId_idx" ON "PaymentMethod"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentMethod_customerId_idx" ON "PaymentMethod"("customerId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_tenantId_branchId_idx" ON "Payment"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_collectedByStaffId_idx" ON "Payment"("tenantId", "collectedByStaffId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_methodType_idx" ON "Payment"("tenantId", "methodType");

-- CreateIndex
CREATE INDEX "Payment_correlationId_idx" ON "Payment"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_idempotencyKey_key" ON "Payment"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_tenantId_idx" ON "Refund"("tenantId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_tenantId_idempotencyKey_key" ON "Refund"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingTransaction_tenantId_idx" ON "BillingTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "BillingTransaction_paymentId_idx" ON "BillingTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "Settlement_tenantId_idx" ON "Settlement"("tenantId");

-- CreateIndex
CREATE INDEX "Settlement_status_idx" ON "Settlement"("status");

-- CreateIndex
CREATE INDEX "SettlementItem_tenantId_idx" ON "SettlementItem"("tenantId");

-- CreateIndex
CREATE INDEX "SettlementItem_settlementId_idx" ON "SettlementItem"("settlementId");

-- CreateIndex
CREATE INDEX "CreditNote_tenantId_idx" ON "CreditNote"("tenantId");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_tenantId_number_key" ON "CreditNote"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_idx" ON "Receipt"("tenantId");

-- CreateIndex
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_tenantId_number_key" ON "Receipt"("tenantId", "number");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_tenantId_idx" ON "PaymentWebhookEvent"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_idx" ON "PaymentWebhookEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "PaymentAuditEvent_tenantId_idx" ON "PaymentAuditEvent"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentAuditEvent_createdAt_idx" ON "PaymentAuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");

-- CreateIndex
CREATE INDEX "PaymentLink_tenantId_idx" ON "PaymentLink"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentLink_invoiceId_idx" ON "PaymentLink"("invoiceId");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_runAt_idx" ON "BackgroundJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_tenantId_idx" ON "BackgroundJob"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_tenantId_type_idempotencyKey_key" ON "BackgroundJob"("tenantId", "type", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PlatformAdminSession" ADD CONSTRAINT "PlatformAdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amenity" ADD CONSTRAINT "Amenity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTypeAmenity" ADD CONSTRAINT "RoomTypeAmenity_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTypeAmenity" ADD CONSTRAINT "RoomTypeAmenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAvailability" ADD CONSTRAINT "RoomAvailability_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAvailability" ADD CONSTRAINT "RoomAvailability_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationReservation" ADD CONSTRAINT "AccommodationReservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationReservation" ADD CONSTRAINT "AccommodationReservation_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationReservation" ADD CONSTRAINT "AccommodationReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationReservation" ADD CONSTRAINT "AccommodationReservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationReservation" ADD CONSTRAINT "AccommodationReservation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationGuest" ADD CONSTRAINT "ReservationGuest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "AccommodationReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "AccommodationReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTimeline" ADD CONSTRAINT "ReservationTimeline_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "AccommodationReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCategory" ADD CONSTRAINT "ResourceCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookableResource" ADD CONSTRAINT "BookableResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookableResource" ADD CONSTRAINT "BookableResource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ResourceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookableResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookableResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceSchedule" ADD CONSTRAINT "ResourceSchedule_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookableResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ResourceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookableResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackoutPeriod" ADD CONSTRAINT "BlackoutPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackoutPeriod" ADD CONSTRAINT "BlackoutPeriod_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookableResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPolicy" ADD CONSTRAINT "BookingPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookableResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingConflict" ADD CONSTRAINT "BookingConflict_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReminder" ADD CONSTRAINT "BookingReminder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookableResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTimeline" ADD CONSTRAINT "BookingTimeline_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Catalog" ADD CONSTRAINT "Catalog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogCategory" ADD CONSTRAINT "CatalogCategory_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogCategory" ADD CONSTRAINT "CatalogCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDetail" ADD CONSTRAINT "ServiceDetail_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDetail" ADD CONSTRAINT "ProductDetail_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageDetail" ADD CONSTRAINT "PackageDetail_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_packageOfferingId_fkey" FOREIGN KEY ("packageOfferingId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_childOfferingId_fkey" FOREIGN KEY ("childOfferingId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Addon" ADD CONSTRAINT "Addon_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Addon" ADD CONSTRAINT "Addon_addonOfferingId_fkey" FOREIGN KEY ("addonOfferingId") REFERENCES "Offering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingRelation" ADD CONSTRAINT "OfferingRelation_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingRelation" ADD CONSTRAINT "OfferingRelation_relatedOfferingId_fkey" FOREIGN KEY ("relatedOfferingId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityLink" ADD CONSTRAINT "AvailabilityLink_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesChannel" ADD CONSTRAINT "SalesChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisibilityRule" ADD CONSTRAINT "VisibilityRule_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisibilityRule" ADD CONSTRAINT "VisibilityRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SalesChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogTag" ADD CONSTRAINT "CatalogTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingTag" ADD CONSTRAINT "OfferingTag_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingTag" ADD CONSTRAINT "OfferingTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CatalogTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningArea" ADD CONSTRAINT "DiningArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_diningAreaId_fkey" FOREIGN KEY ("diningAreaId") REFERENCES "DiningArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_tableGroupId_fkey" FOREIGN KEY ("tableGroupId") REFERENCES "TableGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningMenu" ADD CONSTRAINT "DiningMenu_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningMenu" ADD CONSTRAINT "DiningMenu_diningAreaId_fkey" FOREIGN KEY ("diningAreaId") REFERENCES "DiningArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuSection" ADD CONSTRAINT "MenuSection_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "DiningMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MenuSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_kitchenStationId_fkey" FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStation" ADD CONSTRAINT "KitchenStation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningReservation" ADD CONSTRAINT "DiningReservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "DiningReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningSession" ADD CONSTRAINT "DiningSession_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningOrder" ADD CONSTRAINT "DiningOrder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningOrderItem" ADD CONSTRAINT "DiningOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DiningOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningOrderItem" ADD CONSTRAINT "DiningOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DiningOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_kitchenStationId_fkey" FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerAssignment" ADD CONSTRAINT "ServerAssignment_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "DiningTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerAssignment" ADD CONSTRAINT "ServerAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "DiningShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningShift" ADD CONSTRAINT "DiningShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessFacility" ADD CONSTRAINT "FitnessFacility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessArea" ADD CONSTRAINT "FitnessArea_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "FitnessFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "FitnessFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPeriod" ADD CONSTRAINT "MembershipPeriod_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipFreeze" ADD CONSTRAINT "MembershipFreeze_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBenefit" ADD CONSTRAINT "MembershipBenefit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessClass" ADD CONSTRAINT "FitnessClass_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "FitnessFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessClass" ADD CONSTRAINT "FitnessClass_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FitnessArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessClass" ADD CONSTRAINT "FitnessClass_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "FitnessClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FitnessArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trainer" ADD CONSTRAINT "Trainer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "FitnessClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaFacility" ADD CONSTRAINT "SpaFacility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentRoom" ADD CONSTRAINT "TreatmentRoom_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "SpaFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessArea" ADD CONSTRAINT "WellnessArea_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "SpaFacility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "SpaFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TreatmentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentVariant" ADD CONSTRAINT "TreatmentVariant_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaTherapist" ADD CONSTRAINT "SpaTherapist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistSpecialty" ADD CONSTRAINT "TherapistSpecialty_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "SpaTherapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistTreatmentLink" ADD CONSTRAINT "TherapistTreatmentLink_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "SpaTherapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistTreatmentLink" ADD CONSTRAINT "TherapistTreatmentLink_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaAppointment" ADD CONSTRAINT "SpaAppointment_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaAppointment" ADD CONSTRAINT "SpaAppointment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "TreatmentVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaAppointment" ADD CONSTRAINT "SpaAppointment_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "SpaTherapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaAppointment" ADD CONSTRAINT "SpaAppointment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TreatmentRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentNote" ADD CONSTRAINT "TreatmentNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "SpaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentNote" ADD CONSTRAINT "TreatmentNote_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "SpaTherapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AftercareNote" ADD CONSTRAINT "AftercareNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "SpaAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaShift" ADD CONSTRAINT "SpaShift_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "SpaTherapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessFacilitySession" ADD CONSTRAINT "WellnessFacilitySession_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "WellnessArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaMembership" ADD CONSTRAINT "SpaMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SpaMembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenue" ADD CONSTRAINT "EventVenue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueArea" ADD CONSTRAINT "VenueArea_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "EventVenue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "EventVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "EventOrganizer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "EventVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "VenueArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueBooking" ADD CONSTRAINT "VenueBooking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "EventVenue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueBooking" ADD CONSTRAINT "VenueBooking_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "VenueArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicketType" ADD CONSTRAINT "EventTicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "EventTicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingPlan" ADD CONSTRAINT "SeatingPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingPlan" ADD CONSTRAINT "SeatingPlan_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "EventVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatSection" ADD CONSTRAINT "SeatSection_seatingPlanId_fkey" FOREIGN KEY ("seatingPlanId") REFERENCES "SeatingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SeatSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPackage" ADD CONSTRAINT "EventPackage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAddon" ADD CONSTRAINT "EventAddon_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCheckIn" ADD CONSTRAINT "EventCheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCheckIn" ADD CONSTRAINT "EventCheckIn_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventWaitlist" ADD CONSTRAINT "EventWaitlist_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaVenue" ADD CONSTRAINT "CinemaVenue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaScreen" ADD CONSTRAINT "CinemaScreen_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "CinemaVenue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaSeatMap" ADD CONSTRAINT "CinemaSeatMap_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "CinemaScreen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaSeatSection" ADD CONSTRAINT "CinemaSeatSection_seatMapId_fkey" FOREIGN KEY ("seatMapId") REFERENCES "CinemaSeatMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaSeat" ADD CONSTRAINT "CinemaSeat_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CinemaSeatSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaContent" ADD CONSTRAINT "CinemaContent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaShowtime" ADD CONSTRAINT "CinemaShowtime_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "CinemaContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaShowtime" ADD CONSTRAINT "CinemaShowtime_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "CinemaScreen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaTicketType" ADD CONSTRAINT "CinemaTicketType_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "CinemaShowtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaTicket" ADD CONSTRAINT "CinemaTicket_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "CinemaShowtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaTicket" ADD CONSTRAINT "CinemaTicket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "CinemaTicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaTicket" ADD CONSTRAINT "CinemaTicket_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "CinemaSeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaSeatHold" ADD CONSTRAINT "CinemaSeatHold_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "CinemaShowtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaSeatHold" ADD CONSTRAINT "CinemaSeatHold_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "CinemaSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaAttendee" ADD CONSTRAINT "CinemaAttendee_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "CinemaShowtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaAttendee" ADD CONSTRAINT "CinemaAttendee_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CinemaTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaCheckIn" ADD CONSTRAINT "CinemaCheckIn_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "CinemaShowtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaCheckIn" ADD CONSTRAINT "CinemaCheckIn_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "CinemaTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaWaitlist" ADD CONSTRAINT "CinemaWaitlist_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "CinemaShowtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaConcession" ADD CONSTRAINT "CinemaConcession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "CinemaVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaConcessionOrder" ADD CONSTRAINT "CinemaConcessionOrder_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "CinemaVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaConcessionOrderItem" ADD CONSTRAINT "CinemaConcessionOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CinemaConcessionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaConcessionOrderItem" ADD CONSTRAINT "CinemaConcessionOrderItem_concessionId_fkey" FOREIGN KEY ("concessionId") REFERENCES "CinemaConcession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaShift" ADD CONSTRAINT "CinemaShift_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "CinemaVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryArea" ADD CONSTRAINT "InventoryArea_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReorderRule" ADD CONSTRAINT "InventoryReorderRule_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySupplier" ADD CONSTRAINT "InventorySupplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySupplierItem" ADD CONSTRAINT "InventorySupplierItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "InventorySupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySupplierItem" ADD CONSTRAINT "InventorySupplierItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "InventorySupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAsset" ADD CONSTRAINT "OperationalAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAsset" ADD CONSTRAINT "OperationalAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAsset" ADD CONSTRAINT "OperationalAsset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "OperationalAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "OperationalAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalTaskComment" ADD CONSTRAINT "OperationalTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OperationalTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPreference" ADD CONSTRAINT "CustomerPreference_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagLink" ADD CONSTRAINT "CustomerTagLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagLink" ADD CONSTRAINT "CustomerTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerConsent" ADD CONSTRAINT "CustomerConsent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInteraction" ADD CONSTRAINT "CustomerInteraction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVisit" ADD CONSTRAINT "CustomerVisit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReview" ADD CONSTRAINT "CustomerReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLoyaltyProfile" ADD CONSTRAINT "CustomerLoyaltyProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCommunicationPreference" ADD CONSTRAINT "CustomerCommunicationPreference_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRelationship" ADD CONSTRAINT "CustomerRelationship_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRelationship" ADD CONSTRAINT "CustomerRelationship_relatedCustomerId_fkey" FOREIGN KEY ("relatedCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSchedule" ADD CONSTRAINT "NotificationSchedule_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSchedule" ADD CONSTRAINT "NotificationSchedule_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

