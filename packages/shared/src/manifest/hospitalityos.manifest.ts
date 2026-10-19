/**
 * HospitalityOS app manifest for Master Distributor / LifeOS Portal.
 * Consumed when a client clicks "Install HospitalityOS".
 *
 * Aligns with Master Distributor `TenantBootstrapPayload` + HospitalityOS seed defaults.
 */
import type { ModuleId } from "../index.js";

/** LifeOS platform primitives this domain shell depends on. */
export type RequiredLifeOsPrimitive =
  | "identity" // Trust ID
  | "messaging" // ElfCom
  | "storage" // Sovereign Drive
  | "jobs" // Platform Jobs
  | "distributor" // Master Distributor (control plane)
  | "billing"; // FundzMan / wallet pass-through

/** Portal marketplace card + shell projection metadata for a preset. */
export type HospitalityPortalPreset = {
  preset: string;
  title: string;
  /** Emoji / icon glyph for Portal catalog + Universal Shell */
  icon: string;
  /** Short tag shown in shell-ui when appId=hospitalityos */
  shellTag: string;
  installTemplate: HospitalityInstallTemplateId;
  setupWizard: {
    defaultPrepBufferMins: number;
    deliveryRadiusKm: number;
    fundzmanInstantPayout: boolean;
  };
};

export type HospitalityOsManifest = {
  /** Stable app id registered in LifeOS Portal catalog */
  appId: "hospitalityos";
  displayName: string;
  version: string;
  description: string;
  /** Distributor `enabledPrimitives` subset for hospitality installs */
  distributorPrimitives: Array<"hospitality" | "identity" | "billing" | "messaging">;
  /** Full primitive dependency surface (Portal + HOS adapters) */
  requiredPrimitives: RequiredLifeOsPrimitive[];
  /** Default modules enabled on fresh hotel install (expanded internal ids). */
  defaultModules: ModuleId[];
  /** Optional modules offered in Portal upsell */
  optionalModules: ModuleId[];
  /** Composable suite verticals selectable in the Portal wizard */
  suiteVerticals: SuiteVerticalModuleId[];
  /** Always-on shared base for every install */
  sharedBaseModules: SuiteSharedModuleId[];
  installTemplates: HospitalityInstallTemplate[];
  /** Portal catalog cards keyed by preset (consumed by lifeos-portal / shell-ui). */
  portalPresets: Record<string, HospitalityPortalPreset>;
  brandDefaults: {
    primaryColor: string;
    businessType: string;
  };
  /** Seed applied by HOS after distributor bootstrap callback */
  defaultSeed: HospitalityOsDefaultSeed;
  /** URLs / callbacks LifeOS Portal + Distributor use */
  install: {
    /** Path on Master Distributor */
    bootstrapPath: "/v1/distributor/tenants/bootstrap";
    /** Path on HospitalityOS API after domain is ACTIVE */
    hosProvisionPath: "/internal/distributor/provision";
    oauthDestinations: string[];
  };
};

export type HospitalityOsDefaultSeed = {
  roles: Array<{ role: string; label: string }>;
  taxes: Array<{
    code: string;
    name: string;
    rateBps: number;
    inclusive: boolean;
  }>;
  roomTypes: Array<{
    code: string;
    name: string;
    capacity: number;
    bedConfiguration: string;
    /** Minor units (e.g. 12000 = $120.00) */
    baseRateMinor: number;
    currency: string;
  }>;
  amenities: Array<{ code: string; name: string; category: string }>;
  roomsPerType: number;
  notificationTemplates: Array<{
    key: string;
    channel: "IN_APP" | "EMAIL";
    subject: string;
    body: string;
  }>;
};

export const HOSPITALITYOS_DEFAULT_SEED: HospitalityOsDefaultSeed = {
  roles: [
    { role: "owner", label: "Owner" },
    { role: "admin", label: "Administrator" },
    { role: "manager", label: "Manager" },
    { role: "front_desk", label: "Front desk" },
    { role: "operations", label: "Operations" },
    { role: "viewer", label: "Viewer" },
  ],
  taxes: [
    { code: "VAT", name: "Value Added Tax", rateBps: 750, inclusive: false },
    { code: "CITY", name: "City occupancy tax", rateBps: 200, inclusive: false },
  ],
  roomTypes: [
    {
      code: "STD",
      name: "Standard",
      capacity: 2,
      bedConfiguration: "1 Queen",
      baseRateMinor: 12_000,
      currency: "USD",
    },
    {
      code: "DLX",
      name: "Deluxe",
      capacity: 3,
      bedConfiguration: "1 King + Sofa",
      baseRateMinor: 18_000,
      currency: "USD",
    },
  ],
  amenities: [
    { code: "WIFI", name: "Wi‑Fi", category: "connectivity" },
    { code: "AC", name: "Air conditioning", category: "comfort" },
  ],
  roomsPerType: 2,
  notificationTemplates: [
    {
      key: "BOOKING_CONFIRMED",
      channel: "IN_APP",
      subject: "Booking confirmed",
      body: "Your reservation {{confirmationCode}} is confirmed.",
    },
    {
      key: "CHECKIN_REMINDER",
      channel: "EMAIL",
      subject: "Check-in tomorrow",
      body: "We look forward to welcoming you. Check-in starts at {{checkInTime}}.",
    },
    {
      key: "CHECKOUT_REMINDER",
      channel: "IN_APP",
      subject: "Checkout reminder",
      body: "Checkout is at {{checkOutTime}}. Thank you for staying with us.",
    },
  ],
};

/** Vertical suite modules — install independently or compose on a hotel/resort. */
export const SUITE_VERTICAL_MODULES = [
  "accommodation",
  "shared_homes",
  "dining",
  "local_food",
  "bar",
  "gym_spa",
  "events",
] as const;

export type SuiteVerticalModuleId = (typeof SUITE_VERTICAL_MODULES)[number];

/** Shared base — always included with every HospitalityOS install. */
export const SUITE_SHARED_MODULES = ["billing", "crm"] as const;

export type SuiteSharedModuleId = (typeof SUITE_SHARED_MODULES)[number];

export type SuiteModuleId = SuiteVerticalModuleId | SuiteSharedModuleId;

export const SUITE_MODULE_SET = new Set<string>([
  ...SUITE_VERTICAL_MODULES,
  ...SUITE_SHARED_MODULES,
]);

/** Internal TenantModule rows always present for platform operations. */
export const SUITE_PLATFORM_INTERNAL_MODULES: ModuleId[] = [
  "staff_management",
  "notifications",
  "inventory",
];

export type HospitalityInstallTemplateId =
  | "standalone_restaurant"
  | "standalone_local_food"
  | "standalone_gym_spa"
  | "standalone_bar"
  | "standalone_shared_homes"
  | "full_hotel_resort"
  | "custom";

export interface HospitalityInstallTemplate {
  id: HospitalityInstallTemplateId;
  label: string;
  description: string;
  businessType: string;
  /** Default Property.propertyType for lodging installs */
  propertyType?: string;
  modules: SuiteModuleId[];
}

/**
 * Pre-configured Portal profiles.
 * Shared Homes / Apartment ──► lodging units without hotel F&B stack
 * Standalone Restaurant ──► dining + billing + crm
 * Full Hotel & Resort ──► all verticals + billing + crm
 */
export const HOSPITALITYOS_INSTALL_TEMPLATES: HospitalityInstallTemplate[] = [
  {
    id: "full_hotel_resort",
    label: "Hotel / Resort",
    description:
      "Accommodation as the primary anchor. Attach dining, bar, gym/spa, and events — including charge-to-room folio.",
    businessType: "hotel",
    propertyType: "hotel",
    modules: [
      "accommodation",
      "dining",
      "bar",
      "gym_spa",
      "events",
      "billing",
      "crm",
    ],
  },
  {
    id: "standalone_shared_homes",
    label: "Shared Homes / Apartment",
    description:
      "Apartments, shared homes, and short-lets — unit inventory, calendars, guest stays, and billing. No hotel F&B required.",
    businessType: "shared_homes",
    propertyType: "shared_home",
    modules: ["shared_homes", "billing", "crm"],
  },
  {
    id: "standalone_restaurant",
    label: "Standalone Restaurant",
    description: "POS, menus, and kitchen display — no rooms or housekeeping.",
    businessType: "restaurant",
    modules: ["dining", "billing", "crm"],
  },
  {
    id: "standalone_local_food",
    label: "Local Food & Home Kitchen",
    description:
      "Home cooks, food stalls, and local caterers — GPS-based kitchens, delivery orders, FundzMan escrow, no brick-and-mortar venue required.",
    businessType: "local_food",
    modules: ["local_food", "billing", "crm"],
  },
  {
    id: "standalone_gym_spa",
    label: "Standalone Gym / Spa",
    description: "Memberships, class schedules, and day passes.",
    businessType: "gym",
    modules: ["gym_spa", "billing", "crm"],
  },
  {
    id: "standalone_bar",
    label: "Standalone Bar",
    description: "Beverage POS and open tabs.",
    businessType: "bar",
    modules: ["bar", "billing", "crm"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Pick any combination of hospitality modules.",
    businessType: "hospitality",
    modules: [...SUITE_SHARED_MODULES],
  },
];

/** Map Portal suite ids onto existing TenantModule / staff-nav gates. */
export const SUITE_TO_INTERNAL: Record<SuiteModuleId, ModuleId[]> = {
  accommodation: ["accommodation", "reservations"],
  /** Same lodging engine as hotel accommodation — different Portal / seed profile. */
  shared_homes: ["accommodation", "reservations"],
  dining: ["restaurant"],
  /** Home kitchens / local food — same restaurant module gate; distinct catalog + order APIs. */
  local_food: ["restaurant"],
  bar: ["restaurant"],
  gym_spa: ["gym_membership", "fitness_classes", "spa_services", "wellness_packages"],
  events: ["events", "ticketing", "venue_booking"],
  billing: ["billing"],
  crm: ["customer_management"],
};

const SUITE_DISTINCT_IDS = new Set([
  "dining",
  "local_food",
  "bar",
  "gym_spa",
  "crm",
  "shared_homes",
]);

export function normalizeSuiteModules(input: readonly string[]): SuiteModuleId[] {
  const next = new Set<SuiteModuleId>(SUITE_SHARED_MODULES);
  for (const raw of input) {
    if (SUITE_MODULE_SET.has(raw)) next.add(raw as SuiteModuleId);
  }
  // Prefer a single lodging profile: shared_homes XOR accommodation for nav clarity
  if (next.has("shared_homes") && next.has("accommodation")) {
    next.delete("accommodation");
  }
  // Prefer local_food over brick-and-mortar dining when both selected
  if (next.has("local_food") && next.has("dining")) {
    next.delete("dining");
  }
  return [...SUITE_VERTICAL_MODULES, ...SUITE_SHARED_MODULES].filter((id) => next.has(id));
}

export function expandSuiteToInternal(suite: readonly string[]): ModuleId[] {
  const normalized = normalizeSuiteModules(suite);
  const next = new Set<ModuleId>(SUITE_PLATFORM_INTERNAL_MODULES);
  for (const id of normalized) {
    for (const internal of SUITE_TO_INTERNAL[id]) next.add(internal);
  }
  return [...next];
}

/** True when the payload uses Portal suite ids rather than internal ModuleIds. */
export function looksLikeSuitePayload(modules: readonly string[]): boolean {
  return modules.some((id) => SUITE_DISTINCT_IDS.has(id));
}

export function suiteFromInternal(internal: readonly string[]): SuiteModuleId[] {
  const set = new Set(internal);
  const verticals: SuiteVerticalModuleId[] = [];
  if (set.has("accommodation") || set.has("reservations")) verticals.push("accommodation");
  if (set.has("restaurant")) verticals.push("dining");
  if (set.has("gym_membership") || set.has("fitness_classes") || set.has("spa_services")) {
    verticals.push("gym_spa");
  }
  if (set.has("events") || set.has("ticketing") || set.has("venue_booking")) verticals.push("events");
  return normalizeSuiteModules([...verticals, ...SUITE_SHARED_MODULES]);
}

/**
 * Charge to Room Folio is available when lodging is the property
 * anchor AND at least one POS vertical (dining, bar, or gym/spa) is installed.
 */
export function folioChargeEnabled(suite: readonly string[]): boolean {
  const set = new Set(normalizeSuiteModules(suite));
  if (!set.has("accommodation") && !set.has("shared_homes")) return false;
  return set.has("dining") || set.has("bar") || set.has("gym_spa");
}

export function posSettlementMethods(suite: readonly string[]): string[] {
  const methods = ["fundzman", "cash", "card"];
  if (folioChargeEnabled(suite)) methods.push("charge_to_room");
  return methods;
}

export function businessTypeForSuite(suite: readonly string[]): string {
  const normalized = normalizeSuiteModules(suite);
  const verticals = normalized.filter((id): id is SuiteVerticalModuleId =>
    (SUITE_VERTICAL_MODULES as readonly string[]).includes(id),
  );
  if (verticals.length === 1) {
    const only = verticals[0];
    if (only === "accommodation") return "hotel";
    if (only === "shared_homes") return "shared_homes";
    if (only === "dining") return "restaurant";
    if (only === "local_food") return "local_food";
    if (only === "bar") return "bar";
    if (only === "gym_spa") return "gym";
    if (only === "events") return "events";
  }
  if (verticals.includes("shared_homes") && !verticals.includes("accommodation")) {
    return "shared_homes";
  }
  if (verticals.includes("local_food") && !verticals.includes("dining")) {
    return "local_food";
  }
  if (verticals.includes("accommodation")) return "hotel";
  return "hospitality";
}

export function resolveInstallTemplate(
  templateId: string | undefined,
  modules?: readonly string[],
): HospitalityInstallTemplate {
  const found = HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.id === templateId);
  if (found && found.id !== "custom") return found;
  return {
    ...HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.id === "custom")!,
    modules: normalizeSuiteModules(modules ?? SUITE_SHARED_MODULES),
  };
}

export function resolveProvisionModules(input: {
  enabledModules?: readonly string[];
  modules?: readonly string[];
}): { suite: SuiteModuleId[]; internal: ModuleId[] } {
  const raw = input.enabledModules?.length ? input.enabledModules : input.modules;
  if (!raw?.length) {
    const suite = HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.id === "full_hotel_resort")!.modules;
    return { suite: [...suite], internal: expandSuiteToInternal(suite) };
  }
  if (input.enabledModules?.length || looksLikeSuitePayload(raw)) {
    const suite = normalizeSuiteModules(raw);
    return { suite, internal: expandSuiteToInternal(suite) };
  }
  const known = new Set<string>([
    ...SUITE_PLATFORM_INTERNAL_MODULES,
    ...raw.filter((id) => typeof id === "string"),
  ]);
  const internal = [...known] as ModuleId[];
  return { suite: suiteFromInternal(internal), internal };
}

/** Default seed for Shared Homes / Apartment installs (units, not hotel rooms). */
export const SHARED_HOMES_DEFAULT_SEED: HospitalityOsDefaultSeed = {
  roles: [
    { role: "owner", label: "Owner" },
    { role: "admin", label: "Administrator" },
    { role: "manager", label: "Property manager" },
    { role: "front_desk", label: "Host / concierge" },
    { role: "operations", label: "Turnover / cleaning" },
    { role: "viewer", label: "Viewer" },
  ],
  taxes: [
    { code: "VAT", name: "Value Added Tax", rateBps: 750, inclusive: false },
    { code: "CITY", name: "City occupancy tax", rateBps: 200, inclusive: false },
  ],
  roomTypes: [
    {
      code: "STU",
      name: "Studio",
      capacity: 2,
      bedConfiguration: "1 Queen",
      baseRateMinor: 8_500,
      currency: "USD",
    },
    {
      code: "1BR",
      name: "1-Bedroom",
      capacity: 3,
      bedConfiguration: "1 King",
      baseRateMinor: 12_500,
      currency: "USD",
    },
  ],
  amenities: [
    { code: "WIFI", name: "Wi‑Fi", category: "connectivity" },
    { code: "KITCHEN", name: "Full kitchen", category: "comfort" },
    { code: "WASHER", name: "Washer / dryer", category: "comfort" },
  ],
  roomsPerType: 2,
  notificationTemplates: [
    {
      key: "BOOKING_CONFIRMED",
      channel: "IN_APP",
      subject: "Stay confirmed",
      body: "Your stay {{confirmationCode}} is confirmed. Check-in details are in your guest app.",
    },
    {
      key: "CHECKIN_REMINDER",
      channel: "EMAIL",
      subject: "Access instructions for tomorrow",
      body: "Your unit is ready from {{checkInTime}}. Entry instructions are in the guest app.",
    },
    {
      key: "CHECKOUT_REMINDER",
      channel: "IN_APP",
      subject: "Checkout reminder",
      body: "Please leave the unit by {{checkOutTime}}. Thank you for staying with us.",
    },
  ],
};

export function seedForBusinessType(businessType: string): HospitalityOsDefaultSeed {
  if (
    businessType === "shared_homes" ||
    businessType === "apartment" ||
    businessType === "short_let"
  ) {
    return SHARED_HOMES_DEFAULT_SEED;
  }
  return HOSPITALITYOS_DEFAULT_SEED;
}

/** Local Food & Home Kitchen wizard defaults (tenant.settings.localFood). */
export const LOCAL_FOOD_WIZARD_DEFAULTS = {
  defaultPrepBufferMins: 15,
  deliveryRadiusKm: 8,
  fundzmanInstantPayout: true,
  /** Delivery fee: base minor units + per-km minor units (TransportationOS quote fallback). */
  deliveryFeeBaseMinor: 500,
  deliveryFeePerKmMinor: 150,
  currency: "NGN",
} as const;

/** Vendor order pipeline for home kitchen delivery. */
export const LOCAL_FOOD_ORDER_STATUSES = [
  "ORDER_RECEIVED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "DELIVERED",
  "CANCELLED",
] as const;

export type LocalFoodOrderStatus = (typeof LOCAL_FOOD_ORDER_STATUSES)[number];

export const LOCAL_FOOD_STATUS_TRANSITIONS: Record<
  LocalFoodOrderStatus,
  readonly LocalFoodOrderStatus[]
> = {
  ORDER_RECEIVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Expanded internal ids for a Full Hotel & Resort install (default when modules omitted). */
export const HOSPITALITYOS_DEFAULT_MODULES: ModuleId[] = expandSuiteToInternal(
  HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.id === "full_hotel_resort")!.modules,
);

export const HOSPITALITYOS_OPTIONAL_MODULES: ModuleId[] = [
  "loyalty",
  "analytics",
  "cinema",
  "beauty_appointments",
  "equipment_rental",
  "visitor_management",
  "messaging",
  "promotions",
  "reviews",
  "reporting",
];

/**
 * Canonical HospitalityOS catalog entry for Master Distributor / LifeOS Portal.
 */
export const HOSPITALITYOS_MANIFEST: HospitalityOsManifest = {
  appId: "hospitalityos",
  displayName: "HospitalityOS",
  version: "0.1.0",
  description:
    "Composable domain suite for hospitality — hotels, shared homes, dining, local food / home kitchens, gym/spa, bar, and events.",
  distributorPrimitives: ["hospitality", "identity", "billing", "messaging"],
  requiredPrimitives: [
    "identity",
    "messaging",
    "storage",
    "jobs",
    "distributor",
    "billing",
  ],
  defaultModules: HOSPITALITYOS_DEFAULT_MODULES,
  optionalModules: HOSPITALITYOS_OPTIONAL_MODULES,
  suiteVerticals: [...SUITE_VERTICAL_MODULES],
  sharedBaseModules: [...SUITE_SHARED_MODULES],
  installTemplates: HOSPITALITYOS_INSTALL_TEMPLATES,
  portalPresets: {
    local_food: {
      preset: "local_food",
      title: "🍲 Local Food & Home Kitchen OS",
      icon: "🍲",
      shellTag: "Local Food",
      installTemplate: "standalone_local_food",
      setupWizard: {
        defaultPrepBufferMins: 15,
        deliveryRadiusKm: 8,
        fundzmanInstantPayout: true,
      },
    },
    shared_homes: {
      preset: "shared_homes",
      title: "Shared Homes / Apartment",
      icon: "🏠",
      shellTag: "Shared Homes",
      installTemplate: "standalone_shared_homes",
      setupWizard: {
        defaultPrepBufferMins: 0,
        deliveryRadiusKm: 0,
        fundzmanInstantPayout: false,
      },
    },
  },
  brandDefaults: {
    primaryColor: "#0B3D2E",
    businessType: "hotel",
  },
  defaultSeed: HOSPITALITYOS_DEFAULT_SEED,
  install: {
    bootstrapPath: "/v1/distributor/tenants/bootstrap",
    hosProvisionPath: "/internal/distributor/provision",
    oauthDestinations: [
      "https://{subdomain}.lifeos.app/staff",
      "https://{subdomain}.lifeos.app/guest",
    ],
  },
};

export default HOSPITALITYOS_MANIFEST;
