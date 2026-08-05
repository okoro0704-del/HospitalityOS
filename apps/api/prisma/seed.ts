import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto.js";

const prisma = new PrismaClient();

const defaultHours = [
  { day: "mon", open: "08:00", close: "22:00", closed: false },
  { day: "tue", open: "08:00", close: "22:00", closed: false },
  { day: "wed", open: "08:00", close: "22:00", closed: false },
  { day: "thu", open: "08:00", close: "22:00", closed: false },
  { day: "fri", open: "08:00", close: "23:00", closed: false },
  { day: "sat", open: "09:00", close: "23:00", closed: false },
  { day: "sun", open: "09:00", close: "20:00", closed: false },
];

type SeedTenant = {
  slug: string;
  name: string;
  businessType: string;
  experienceId: string;
  lifeosBusinessId: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  modules: string[];
  branchName: string;
  staffEmail: string;
};

const tenants: SeedTenant[] = [
  {
    slug: "sunrise-hotel",
    name: "Sunrise Hotel",
    businessType: "hotel",
    experienceId: "exp_sunrise_hotel",
    lifeosBusinessId: "biz_sunrise_hotel",
    primaryColor: "#0F766E",
    secondaryColor: "#134E4A",
    accentColor: "#F59E0B",
    modules: ["accommodation", "restaurant", "events", "reservations", "customer_management", "staff_management", "notifications", "analytics"],
    branchName: "Main Building",
    staffEmail: "front@sunrise.hotel",
  },
  {
    slug: "bella-restaurant",
    name: "Bella Restaurant",
    businessType: "restaurant",
    experienceId: "exp_bella_restaurant",
    lifeosBusinessId: "biz_bella_restaurant",
    primaryColor: "#9F1239",
    secondaryColor: "#4C0519",
    accentColor: "#FB7185",
    modules: ["restaurant", "reservations", "promotions", "customer_management", "staff_management", "notifications"],
    branchName: "Downtown",
    staffEmail: "host@bella.dining",
  },
  {
    slug: "peak-fitness",
    name: "Peak Fitness Gym",
    businessType: "gym",
    experienceId: "exp_peak_fitness",
    lifeosBusinessId: "biz_peak_fitness",
    primaryColor: "#1D4ED8",
    secondaryColor: "#1E3A8A",
    accentColor: "#22D3EE",
    modules: ["gym_membership", "fitness_classes", "wellness_packages", "customer_management", "staff_management", "notifications", "analytics"],
    branchName: "Central Campus",
    staffEmail: "ops@peak.fitness",
  },
  {
    slug: "serenity-spa",
    name: "Serenity Spa",
    businessType: "spa",
    experienceId: "exp_serenity_spa",
    lifeosBusinessId: "biz_serenity_spa",
    primaryColor: "#6D28D9",
    secondaryColor: "#4C1D95",
    accentColor: "#C4B5FD",
    modules: ["spa_services", "beauty_appointments", "wellness_packages", "customer_management", "staff_management", "notifications"],
    branchName: "Wellness Wing",
    staffEmail: "care@serenity.spa",
  },
  {
    slug: "royal-event-centre",
    name: "Royal Event Centre",
    businessType: "event_centre",
    experienceId: "exp_royal_events",
    lifeosBusinessId: "biz_royal_events",
    primaryColor: "#B45309",
    secondaryColor: "#78350F",
    accentColor: "#FDE68A",
    modules: ["venue_booking", "ticketing", "events", "customer_management", "staff_management", "notifications", "reporting"],
    branchName: "Grand Hall",
    staffEmail: "events@royal.centre",
  },
  {
    slug: "city-cinema",
    name: "City Cinema",
    businessType: "cinema",
    experienceId: "exp_city_cinema",
    lifeosBusinessId: "biz_city_cinema",
    primaryColor: "#111827",
    secondaryColor: "#374151",
    accentColor: "#F97316",
    modules: ["ticketing", "events", "promotions", "customer_management", "staff_management", "notifications"],
    branchName: "Screen Complex",
    staffEmail: "box@city.cinema",
  },
  {
    slug: "ocean-view-resort",
    name: "Ocean View Resort",
    businessType: "resort",
    experienceId: "exp_ocean_view",
    lifeosBusinessId: "biz_ocean_view",
    primaryColor: "#0369A1",
    secondaryColor: "#0C4A6E",
    accentColor: "#38BDF8",
    modules: [
      "accommodation",
      "restaurant",
      "spa_services",
      "events",
      "venue_booking",
      "reservations",
      "customer_management",
      "staff_management",
      "notifications",
      "loyalty",
      "analytics",
    ],
    branchName: "Resort Campus",
    staffEmail: "concierge@oceanview.resort",
  },
];

async function main() {
  console.log("Seeding HospitalityOS…");

  for (const t of tenants) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        name: t.name,
        businessType: t.businessType,
        experienceId: t.experienceId,
        lifeosBusinessId: t.lifeosBusinessId,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        accentColor: t.accentColor,
        theme: "light",
        email: `hello@${t.slug}.example`,
        phone: "+10000000000",
        city: "Lagos",
        country: "NG",
        operatingHours: defaultHours,
        settings: {},
        status: "active",
      },
      update: {
        name: t.name,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        accentColor: t.accentColor,
        experienceId: t.experienceId,
        lifeosBusinessId: t.lifeosBusinessId,
        operatingHours: defaultHours,
        settings: {},
        status: "active",
      },
    });

    await prisma.branch.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "MAIN" } },
      create: {
        tenantId: tenant.id,
        name: t.branchName,
        code: "MAIN",
        timezone: "Africa/Lagos",
        isPrimary: true,
        status: "active",
        city: "Lagos",
        country: "NG",
      },
      update: { name: t.branchName, status: "active" },
    });

    for (const moduleId of t.modules) {
      await prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId: tenant.id, moduleId } },
        create: { tenantId: tenant.id, moduleId, enabled: true, config: {} },
        update: { enabled: true, config: {} },
      });
    }

    await prisma.staffMember.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: t.staffEmail } },
      create: {
        tenantId: tenant.id,
        displayName: `${t.name} Admin`,
        email: t.staffEmail,
        passwordHash: hashPassword("password123"),
        role: "admin",
        branchIds: [],
        status: "active",
      },
      update: {
        passwordHash: hashPassword("password123"),
        role: "admin",
        status: "active",
      },
    });

    if (t.modules.includes("accommodation")) {
      await seedAccommodation(tenant.id, t.name, t.businessType);
    }

    await seedCommerce(tenant.id, t.name);

    if (t.modules.includes("restaurant")) {
      await seedDining(tenant.id, t.name);
    }

    if (t.modules.includes("gym_membership") || t.modules.includes("fitness_classes")) {
      await seedFitness(tenant.id, t.name);
    }

    console.log(`  ✓ ${t.name} (${t.slug}) — modules: ${t.modules.length}`);
  }

  console.log("Seed complete. Staff password for all demo accounts: password123");
}

async function seedAccommodation(tenantId: string, name: string, businessType: string) {
  const propertyType =
    businessType === "resort"
      ? "resort"
      : businessType === "hotel"
        ? "hotel"
        : "hotel";

  const property = await prisma.property.upsert({
    where: { tenantId_code: { tenantId, code: "MAIN" } },
    create: {
      tenantId,
      name: `${name} Property`,
      code: "MAIN",
      propertyType,
      status: "active",
      timezone: "Africa/Lagos",
      checkInTime: "15:00",
      checkOutTime: "11:00",
      email: `stay@${tenantId.slice(0, 6)}.example`,
      city: "Lagos",
      country: "NG",
      addressLine1: "1 Harbour Road",
      inheritBranding: true,
    },
    update: { name: `${name} Property`, status: "active", propertyType },
  });

  const wifi = await prisma.amenity.upsert({
    where: { tenantId_code: { tenantId, code: "WIFI" } },
    create: { tenantId, name: "Wi‑Fi", code: "WIFI", category: "connectivity" },
    update: { name: "Wi‑Fi" },
  });
  const ac = await prisma.amenity.upsert({
    where: { tenantId_code: { tenantId, code: "AC" } },
    create: { tenantId, name: "Air conditioning", code: "AC", category: "comfort" },
    update: { name: "Air conditioning" },
  });

  const standard = await prisma.roomType.upsert({
    where: { propertyId_code: { propertyId: property.id, code: "STD" } },
    create: {
      tenantId,
      propertyId: property.id,
      name: "Standard",
      code: "STD",
      description: "Comfortable standard room with city views.",
      capacity: 2,
      bedConfiguration: "1 Queen",
      baseRate: 120,
      currency: "USD",
      photoUrls: ["https://placehold.co/800x500/0f766e/ffffff?text=Standard"],
      status: "active",
    },
    update: { name: "Standard", baseRate: 120, status: "active" },
  });

  const deluxe = await prisma.roomType.upsert({
    where: { propertyId_code: { propertyId: property.id, code: "DLX" } },
    create: {
      tenantId,
      propertyId: property.id,
      name: "Deluxe",
      code: "DLX",
      description: "Spacious deluxe room with lounge seating.",
      capacity: 3,
      bedConfiguration: "1 King + Sofa",
      baseRate: 180,
      currency: "USD",
      photoUrls: ["https://placehold.co/800x500/134e4a/ffffff?text=Deluxe"],
      status: "active",
    },
    update: { name: "Deluxe", baseRate: 180, status: "active" },
  });

  for (const rt of [standard, deluxe]) {
    for (const amenityId of [wifi.id, ac.id]) {
      await prisma.roomTypeAmenity.upsert({
        where: {
          roomTypeId_amenityId: { roomTypeId: rt.id, amenityId },
        },
        create: { roomTypeId: rt.id, amenityId },
        update: {},
      });
    }
  }

  const roomDefs = [
    { number: "101", roomTypeId: standard.id },
    { number: "102", roomTypeId: standard.id },
    { number: "201", roomTypeId: deluxe.id },
    { number: "202", roomTypeId: deluxe.id },
  ];

  for (const def of roomDefs) {
    const room = await prisma.room.upsert({
      where: { propertyId_number: { propertyId: property.id, number: def.number } },
      create: {
        tenantId,
        propertyId: property.id,
        roomTypeId: def.roomTypeId,
        number: def.number,
        occupancyStatus: "vacant",
        housekeepingStatus: "clean",
        maintenanceStatus: "available",
        status: "active",
      },
      update: {
        roomTypeId: def.roomTypeId,
        status: "active",
        housekeepingStatus: "clean",
        maintenanceStatus: "available",
      },
    });
    const { syncRoomToBookableResource, ensureDefaultCategories, ensureDefaultPolicy } =
      await import("../src/services/booking-engine.js");
    await ensureDefaultCategories(tenantId);
    await ensureDefaultPolicy(tenantId);
    await ensureDefaultPolicy(tenantId, "accommodation");
    await syncRoomToBookableResource({
      tenantId,
      roomId: room.id,
      roomNumber: room.number,
      propertyCode: property.code,
      capacity: 1,
    });
  }

  await prisma.ratePlan.upsert({
    where: { propertyId_code: { propertyId: property.id, code: "BAR" } },
    create: {
      tenantId,
      propertyId: property.id,
      roomTypeId: standard.id,
      name: "Best Available Rate",
      code: "BAR",
      amount: 120,
      currency: "USD",
      status: "active",
    },
    update: { amount: 120, status: "active" },
  });
}

async function seedCommerce(tenantId: string, tenantName: string) {
  const { ensureDefaultCatalog, createOffering } = await import(
    "../src/services/commerce-engine.js"
  );
  const catalog = await ensureDefaultCatalog(tenantId);

  const catStay = await prisma.catalogCategory.upsert({
    where: { catalogId_code: { catalogId: catalog.id, code: "stays" } },
    create: {
      tenantId,
      catalogId: catalog.id,
      name: "Stays",
      code: "stays",
      slug: "stays",
      sortOrder: 1,
      status: "active",
    },
    update: { status: "active" },
  });
  const catRetail = await prisma.catalogCategory.upsert({
    where: { catalogId_code: { catalogId: catalog.id, code: "retail" } },
    create: {
      tenantId,
      catalogId: catalog.id,
      name: "Retail",
      code: "retail",
      slug: "retail",
      sortOrder: 2,
      status: "active",
    },
    update: { status: "active" },
  });

  const existingService = await prisma.offering.findFirst({
    where: { tenantId, code: "CONSULT-60" },
  });
  if (!existingService) {
    const resources = await prisma.bookableResource.findMany({
      where: { tenantId, status: "available" },
      take: 1,
    });
    await createOffering({
      tenantId,
      catalogId: catalog.id,
      kind: "service",
      name: `${tenantName} Experience`,
      code: "CONSULT-60",
      categoryId: catStay.id,
      description: "A 60-minute bookable experience.",
      shortDescription: "Bookable service",
      basePrice: 75,
      status: "active",
      visibility: "public",
      featured: true,
      durationMinutes: 60,
      bookable: true,
      bookableResourceIds: resources.map((r) => r.id),
      moduleId: "events",
      actorKind: "system",
    });
  }

  const existingProduct = await prisma.offering.findFirst({
    where: { tenantId, code: "WATER-500" },
  });
  if (!existingProduct) {
    await createOffering({
      tenantId,
      catalogId: catalog.id,
      kind: "product",
      name: "Bottled Water",
      code: "WATER-500",
      categoryId: catRetail.id,
      shortDescription: "500ml still water",
      basePrice: 3,
      status: "active",
      visibility: "public",
      sku: "WTR-500",
      unit: "bottle",
      stockPlaceholder: 100,
      actorKind: "system",
    });
  }

  const service = await prisma.offering.findFirst({ where: { tenantId, code: "CONSULT-60" } });
  const product = await prisma.offering.findFirst({ where: { tenantId, code: "WATER-500" } });
  const existingPkg = await prisma.offering.findFirst({
    where: { tenantId, code: "WELCOME-PKG" },
  });
  if (!existingPkg && service && product) {
    await createOffering({
      tenantId,
      catalogId: catalog.id,
      kind: "package",
      name: "Welcome Package",
      code: "WELCOME-PKG",
      shortDescription: "Experience + water",
      basePrice: 70,
      bundlePrice: 70,
      status: "active",
      visibility: "public",
      packageItems: [
        { childOfferingId: service.id, quantity: 1, required: true },
        { childOfferingId: product.id, quantity: 1, required: true },
      ],
      actorKind: "system",
    });
  }

  await prisma.promotion.upsert({
    where: { tenantId_code: { tenantId, code: "SAVE10" } },
    create: {
      tenantId,
      name: "Save 10%",
      code: "SAVE10",
      kind: "percent",
      percent: 10,
      amount: 0,
      stackable: false,
      channelIds: [],
      config: {},
      status: "active",
    },
    update: { status: "active", percent: 10 },
  });
  const promo = await prisma.promotion.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "SAVE10" } },
  });
  await prisma.coupon.upsert({
    where: { tenantId_code: { tenantId, code: "SAVE10" } },
    create: {
      tenantId,
      promotionId: promo.id,
      code: "SAVE10",
      status: "active",
    },
    update: { promotionId: promo.id, status: "active" },
  });
}

async function seedDining(tenantId: string, tenantName: string) {
  const {
    createDiningArea,
    createDiningTable,
    createMenuWithCommerceItem,
  } = await import("../src/services/restaurant.js");

  let area = await prisma.diningArea.findFirst({
    where: { tenantId, code: "MAIN-DINING" },
  });
  if (!area) {
    area = await createDiningArea({
      tenantId,
      name: `${tenantName} Dining`,
      code: "MAIN-DINING",
      areaType: "indoor",
      description: "Main dining room",
      actorKind: "system",
    });
  }

  const existingTables = await prisma.diningTable.count({ where: { tenantId } });
  if (existingTables === 0) {
    for (const def of [
      { name: "Table 1", code: "T1", capacity: 2 },
      { name: "Table 2", code: "T2", capacity: 4 },
      { name: "Table 3", code: "T3", capacity: 6 },
    ]) {
      await createDiningTable({
        tenantId,
        diningAreaId: area.id,
        name: def.name,
        code: def.code,
        capacity: def.capacity,
        actorKind: "system",
      });
    }
  }

  let station = await prisma.kitchenStation.findFirst({
    where: { tenantId, code: "HOT" },
  });
  if (!station) {
    station = await prisma.kitchenStation.create({
      data: { tenantId, name: "Hot line", code: "HOT", status: "active" },
    });
  }

  let menu = await prisma.diningMenu.findFirst({
    where: { tenantId, code: "DINNER" },
  });
  if (!menu) {
    menu = await prisma.diningMenu.create({
      data: {
        tenantId,
        diningAreaId: area.id,
        name: "Dinner Menu",
        code: "DINNER",
        featured: true,
        status: "active",
      },
    });
    const section = await prisma.menuSection.create({
      data: {
        tenantId,
        menuId: menu.id,
        name: "Mains",
        code: "MAINS",
        sortOrder: 1,
        status: "active",
      },
    });
    await createMenuWithCommerceItem({
      tenantId,
      menuId: menu.id,
      sectionId: section.id,
      name: "House Special",
      code: "SPECIAL",
      price: 28,
      description: "Chef's seasonal special",
      kitchenStationId: station.id,
      featured: true,
      asProduct: true,
      actorKind: "system",
    });
    await createMenuWithCommerceItem({
      tenantId,
      menuId: menu.id,
      sectionId: section.id,
      name: "Garden Salad",
      code: "SALAD",
      price: 12,
      kitchenStationId: station.id,
      asProduct: true,
      actorKind: "system",
    });
  }

  await prisma.serviceChargeRule.findFirst({ where: { tenantId } }).then(async (r) => {
    if (!r) {
      await prisma.serviceChargeRule.create({
        data: { tenantId, name: "Service", percent: 10, amount: 0, status: "active" },
      });
    }
  });
}

async function seedFitness(tenantId: string, tenantName: string) {
  const {
    createMembershipPlan,
    createClassSession,
  } = await import("../src/services/fitness.js");

  let facility = await prisma.fitnessFacility.findFirst({
    where: { tenantId, code: "MAIN-GYM" },
  });
  if (!facility) {
    facility = await prisma.fitnessFacility.create({
      data: {
        tenantId,
        name: `${tenantName} Floor`,
        code: "MAIN-GYM",
        description: "Primary fitness facility",
        metadata: {},
        status: "active",
      },
    });
  }

  const areaDefs = [
    { name: "Gym Floor", code: "FLOOR", areaType: "gym_floor", capacity: 80 },
    { name: "Studio A", code: "STUDIO-A", areaType: "studio", capacity: 25 },
    { name: "Cardio Zone", code: "CARDIO", areaType: "cardio", capacity: 30 },
  ];
  for (const def of areaDefs) {
    const existing = await prisma.fitnessArea.findFirst({
      where: { facilityId: facility.id, code: def.code },
    });
    if (!existing) {
      await prisma.fitnessArea.create({
        data: {
          tenantId,
          facilityId: facility.id,
          name: def.name,
          code: def.code,
          areaType: def.areaType,
          capacity: def.capacity,
          metadata: {},
          status: "active",
        },
      });
    }
  }

  const studio = await prisma.fitnessArea.findFirst({
    where: { facilityId: facility.id, code: "STUDIO-A" },
  });

  if ((await prisma.membershipPlan.count({ where: { tenantId } })) === 0) {
    const monthly = await createMembershipPlan({
      tenantId,
      facilityId: facility.id,
      name: "Monthly Unlimited",
      code: "MONTHLY",
      description: "Full facility access for 30 days",
      durationDays: 30,
      price: 79,
      guestPrivileges: true,
      actorKind: "system",
    });
    await prisma.membershipBenefit.create({
      data: {
        tenantId,
        planId: monthly.id,
        name: "Guest privilege",
        code: "GUEST",
        config: { guestsPerMonth: 2 },
        status: "active",
      },
    });
    await createMembershipPlan({
      tenantId,
      facilityId: facility.id,
      name: "Day Pass",
      code: "DAY",
      description: "Single-day facility access",
      durationDays: 1,
      price: 25,
      guestPrivileges: false,
      actorKind: "system",
    });
  }

  let classType = await prisma.classType.findFirst({
    where: { tenantId, code: "YOGA" },
  });
  if (!classType) {
    classType = await prisma.classType.create({
      data: {
        tenantId,
        name: "Yoga",
        code: "YOGA",
        description: "Mind-body classes",
        status: "active",
      },
    });
  }

  let fitnessClass = await prisma.fitnessClass.findFirst({
    where: { tenantId, code: "YOGA60" },
  });
  if (!fitnessClass) {
    fitnessClass = await prisma.fitnessClass.create({
      data: {
        tenantId,
        facilityId: facility.id,
        areaId: studio?.id,
        classTypeId: classType.id,
        name: "Morning Yoga",
        code: "YOGA60",
        description: "60-minute vinyasa flow",
        capacity: 20,
        durationMinutes: 60,
        membershipRequired: false,
        metadata: {},
        status: "active",
      },
    });
  }

  let trainer = await prisma.trainer.findFirst({
    where: { tenantId, email: "coach@peak.fitness" },
  });
  if (!trainer) {
    trainer = await prisma.trainer.create({
      data: {
        tenantId,
        displayName: "Alex Coach",
        email: "coach@peak.fitness",
        specializations: ["yoga", "hiit", "strength"],
        bio: "Certified personal trainer and yoga instructor",
        status: "active",
      },
    });
  }

  const assignment = await prisma.trainerAssignment.findFirst({
    where: { trainerId: trainer.id, classId: fitnessClass.id },
  });
  if (!assignment) {
    await prisma.trainerAssignment.create({
      data: {
        tenantId,
        trainerId: trainer.id,
        classId: fitnessClass.id,
        role: "instructor",
        status: "active",
      },
    });
  }

  const upcoming = await prisma.classSession.count({
    where: { tenantId, startsAt: { gte: new Date() } },
  });
  if (upcoming === 0) {
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 3);
    startsAt.setUTCHours(9, 0, 0, 0);
    await createClassSession({
      tenantId,
      classId: fitnessClass.id,
      startsAt,
      capacity: 20,
      areaId: studio?.id,
      trainerId: trainer.id,
      actorKind: "system",
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
