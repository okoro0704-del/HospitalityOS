import type { HospitalityOsDefaultSeed } from "@hospitalityos/shared";
import { prisma } from "../../db.js";

function ratePercentFromBps(bps: number): number {
  return bps / 100;
}

export async function seedPlatformDefaults(opts: {
  tenantId: string;
  seed: HospitalityOsDefaultSeed;
}) {
  for (const tax of opts.seed.taxes) {
    await prisma.taxRule.create({
      data: {
        tenantId: opts.tenantId,
        name: tax.name,
        ratePercent: ratePercentFromBps(tax.rateBps),
        inclusive: tax.inclusive,
        status: "active",
      },
    });
  }

  for (const tpl of opts.seed.notificationTemplates) {
    await prisma.notificationTemplate.create({
      data: {
        tenantId: opts.tenantId,
        code: tpl.key,
        name: tpl.subject,
        category: "transactional",
        channel: tpl.channel === "EMAIL" ? "email" : "in_app",
        type: "transactional",
        subject: tpl.subject,
        body: tpl.body,
        variables: {},
        version: 1,
        status: "active",
      },
    });
  }
}

export async function seedAccommodationDefaults(opts: {
  tenantId: string;
  branchId: string;
  displayName: string;
  seed: HospitalityOsDefaultSeed;
  propertyType?: string;
}) {
  const propertyType = opts.propertyType ?? "hotel";
  const unitWord =
    propertyType === "hotel" || propertyType === "resort" || propertyType === "hostel"
      ? "room"
      : "unit";

  const property = await prisma.property.create({
    data: {
      tenantId: opts.tenantId,
      branchId: opts.branchId,
      name: `${opts.displayName} Property`,
      code: "MAIN",
      propertyType,
      timezone: "UTC",
      status: "active",
      addressLine1: null,
      city: null,
      country: null,
    },
  });

  const amenityIds: string[] = [];
  for (const a of opts.seed.amenities) {
    const row = await prisma.amenity.create({
      data: {
        tenantId: opts.tenantId,
        name: a.name,
        code: a.code,
        category: a.category,
      },
    });
    amenityIds.push(row.id);
  }

  let floorNum = 1;
  for (const rt of opts.seed.roomTypes) {
    const roomType = await prisma.roomType.create({
      data: {
        tenantId: opts.tenantId,
        propertyId: property.id,
        name: rt.name,
        code: rt.code,
        description: `${rt.name} ${unitWord}`,
        capacity: rt.capacity,
        bedConfiguration: rt.bedConfiguration,
        baseRate: rt.baseRateMinor,
        currency: rt.currency,
        photoUrls: [],
        status: "active",
      },
    });
    for (const amenityId of amenityIds) {
      await prisma.roomTypeAmenity.create({
        data: { roomTypeId: roomType.id, amenityId },
      });
    }
    for (let i = 1; i <= opts.seed.roomsPerType; i++) {
      const number = `${floorNum}0${i}`;
      await prisma.room.create({
        data: {
          tenantId: opts.tenantId,
          propertyId: property.id,
          roomTypeId: roomType.id,
          number,
          occupancyStatus: "vacant",
          housekeepingStatus: "clean",
          maintenanceStatus: "available",
          status: "active",
        },
      });
    }
    floorNum += 1;
  }
}

export async function seedDiningDefaults(opts: {
  tenantId: string;
  displayName: string;
}) {
  const { createDiningArea, createDiningTable, createMenuWithCommerceItem } = await import(
    "../restaurant.js"
  );

  const area = await createDiningArea({
    tenantId: opts.tenantId,
    name: `${opts.displayName} Dining`,
    code: "MAIN-DINING",
    areaType: "indoor",
    description: "Main dining room",
    actorKind: "system",
  });

  for (const def of [
    { name: "Table 1", code: "T1", capacity: 2 },
    { name: "Table 2", code: "T2", capacity: 4 },
    { name: "Table 3", code: "T3", capacity: 6 },
  ]) {
    await createDiningTable({
      tenantId: opts.tenantId,
      diningAreaId: area.id,
      name: def.name,
      code: def.code,
      capacity: def.capacity,
      actorKind: "system",
    });
  }

  const station = await prisma.kitchenStation.create({
    data: { tenantId: opts.tenantId, name: "Hot line", code: "HOT", status: "active" },
  });

  const menu = await prisma.diningMenu.create({
    data: {
      tenantId: opts.tenantId,
      diningAreaId: area.id,
      name: "Dinner Menu",
      code: "DINNER",
      featured: true,
      status: "active",
    },
  });
  const section = await prisma.menuSection.create({
    data: {
      tenantId: opts.tenantId,
      menuId: menu.id,
      name: "Mains",
      code: "MAINS",
      sortOrder: 1,
      status: "active",
    },
  });
  await createMenuWithCommerceItem({
    tenantId: opts.tenantId,
    menuId: menu.id,
    sectionId: section.id,
    name: "House Special",
    code: "SPECIAL",
    price: 2800,
    description: "Chef's seasonal special",
    kitchenStationId: station.id,
    featured: true,
    asProduct: true,
    actorKind: "system",
  });
  await createMenuWithCommerceItem({
    tenantId: opts.tenantId,
    menuId: menu.id,
    sectionId: section.id,
    name: "Garden Salad",
    code: "SALAD",
    price: 1200,
    kitchenStationId: station.id,
    asProduct: true,
    actorKind: "system",
  });

  await prisma.serviceChargeRule.create({
    data: { tenantId: opts.tenantId, name: "Service", percent: 10, amount: 0, status: "active" },
  });
}

export async function seedBarDefaults(opts: {
  tenantId: string;
  displayName: string;
}) {
  const { createDiningArea, createDiningTable, createMenuWithCommerceItem } = await import(
    "../restaurant.js"
  );

  const area = await createDiningArea({
    tenantId: opts.tenantId,
    name: `${opts.displayName} Bar`,
    code: "MAIN-BAR",
    areaType: "bar",
    description: "Beverage POS and open tabs",
    actorKind: "system",
  });

  for (const def of [
    { name: "Bar 1", code: "B1", capacity: 2 },
    { name: "Bar 2", code: "B2", capacity: 4 },
  ]) {
    await createDiningTable({
      tenantId: opts.tenantId,
      diningAreaId: area.id,
      name: def.name,
      code: def.code,
      capacity: def.capacity,
      actorKind: "system",
    });
  }

  let station = await prisma.kitchenStation.findFirst({
    where: { tenantId: opts.tenantId, code: "BAR" },
  });
  if (!station) {
    station = await prisma.kitchenStation.create({
      data: { tenantId: opts.tenantId, name: "Bar", code: "BAR", status: "active" },
    });
  }

  const menu = await prisma.diningMenu.create({
    data: {
      tenantId: opts.tenantId,
      diningAreaId: area.id,
      name: "Beverage Menu",
      code: "BAR-MENU",
      featured: true,
      status: "active",
    },
  });
  const section = await prisma.menuSection.create({
    data: {
      tenantId: opts.tenantId,
      menuId: menu.id,
      name: "Drinks",
      code: "DRINKS",
      sortOrder: 1,
      status: "active",
    },
  });
  await createMenuWithCommerceItem({
    tenantId: opts.tenantId,
    menuId: menu.id,
    sectionId: section.id,
    name: "House Pour",
    code: "POUR",
    price: 900,
    description: "Standard bar pour",
    kitchenStationId: station.id,
    featured: true,
    asProduct: true,
    actorKind: "system",
  });
  await createMenuWithCommerceItem({
    tenantId: opts.tenantId,
    menuId: menu.id,
    sectionId: section.id,
    name: "Craft Cocktail",
    code: "COCKTAIL",
    price: 1600,
    kitchenStationId: station.id,
    asProduct: true,
    actorKind: "system",
  });

  const existingCharge = await prisma.serviceChargeRule.findFirst({
    where: { tenantId: opts.tenantId },
  });
  if (!existingCharge) {
    await prisma.serviceChargeRule.create({
      data: { tenantId: opts.tenantId, name: "Service", percent: 10, amount: 0, status: "active" },
    });
  }
}

export async function seedGymSpaDefaults(opts: {
  tenantId: string;
  displayName: string;
}) {
  const { createMembershipPlan } = await import("../fitness.js");

  const facility = await prisma.fitnessFacility.create({
    data: {
      tenantId: opts.tenantId,
      name: `${opts.displayName} Floor`,
      code: "MAIN-GYM",
      description: "Primary fitness facility",
      metadata: {},
      status: "active",
    },
  });

  await prisma.fitnessArea.create({
    data: {
      tenantId: opts.tenantId,
      facilityId: facility.id,
      name: "Gym Floor",
      code: "FLOOR",
      areaType: "gym_floor",
      capacity: 80,
      metadata: {},
      status: "active",
    },
  });

  await createMembershipPlan({
    tenantId: opts.tenantId,
    facilityId: facility.id,
    name: "Monthly Unlimited",
    code: "MONTHLY",
    description: "Full facility access for 30 days",
    durationDays: 30,
    price: 7900,
    guestPrivileges: true,
    actorKind: "system",
  });
  await createMembershipPlan({
    tenantId: opts.tenantId,
    facilityId: facility.id,
    name: "Day Pass",
    code: "DAY",
    description: "Single-day facility access",
    durationDays: 1,
    price: 2500,
    guestPrivileges: false,
    actorKind: "system",
  });

  const spa = await prisma.spaFacility.create({
    data: {
      tenantId: opts.tenantId,
      name: `${opts.displayName} Spa`,
      code: "MAIN-SPA",
      description: "Primary spa facility",
      metadata: {},
      status: "active",
    },
  });
  await prisma.treatmentRoom.create({
    data: {
      tenantId: opts.tenantId,
      facilityId: spa.id,
      name: "Massage Room 1",
      code: "MASSAGE-1",
      roomType: "massage",
      capacity: 1,
      compatibleTreatments: [],
      status: "available",
      metadata: {},
    },
  });
}

export async function seedEventsDefaults(opts: {
  tenantId: string;
  displayName: string;
}) {
  const venue = await prisma.eventVenue.create({
    data: {
      tenantId: opts.tenantId,
      name: `${opts.displayName} Grand Hall`,
      code: "GRAND",
      description: "Primary event venue",
      venueType: "ballroom",
      capacity: 300,
      location: "Main Building",
      amenities: ["av", "catering", "wifi"],
      imageUrls: [],
      metadata: {},
      status: "active",
    },
  });
  await prisma.venueArea.create({
    data: {
      tenantId: opts.tenantId,
      venueId: venue.id,
      name: "Grand Ballroom",
      code: "BALLROOM",
      capacity: 250,
      status: "active",
      metadata: {},
    },
  });
}
