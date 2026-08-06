/**
 * HospitalityOS shared types and module catalog.
 * New modules are registered here — tenants enable/disable them at runtime.
 */

/** Canonical module identifiers. Add new modules here without redesigning the platform. */
export const MODULE_IDS = [
  "accommodation",
  "restaurant",
  "reservations",
  "events",
  "ticketing",
  "venue_booking",
  "cinema",
  "gym_membership",
  "fitness_classes",
  "spa_services",
  "beauty_appointments",
  "wellness_packages",
  "equipment_rental",
  "visitor_management",
  "inventory",
  "staff_management",
  "customer_management",
  "messaging",
  "promotions",
  "loyalty",
  "reviews",
  "analytics",
  "reporting",
  "notifications",
  "billing",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleCategory =
  | "core"
  | "hospitality"
  | "dining"
  | "wellness"
  | "events"
  | "operations"
  | "growth"
  | "insights";

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  category: ModuleCategory;
  /** Staff navigation area key when module is enabled. */
  staffNavKey?: string;
  /** Guest surface key when module is enabled. */
  guestNavKey?: string;
  version: string;
}

/** Static module registry — source of truth for available capabilities. */
export const MODULE_CATALOG: Record<ModuleId, ModuleDefinition> = {
  accommodation: {
    id: "accommodation",
    name: "Accommodation",
    description: "Rooms, stays, and lodging inventory",
    category: "hospitality",
    staffNavKey: "accommodation",
    guestNavKey: "stay",
    version: "2.0.0",
  },
  restaurant: {
    id: "restaurant",
    name: "Restaurant & Dining",
    description: "Menus, dining service, and table operations",
    category: "dining",
    staffNavKey: "restaurant",
    guestNavKey: "dining",
    version: "2.0.0",
  },
  reservations: {
    id: "reservations",
    name: "Reservations",
    description: "Cross-venue reservation management",
    category: "core",
    staffNavKey: "reservations",
    guestNavKey: "bookings",
    version: "1.0.0",
  },
  events: {
    id: "events",
    name: "Events & Venues",
    description: "Venues, ticketed events, sessions, and venue rental",
    category: "events",
    staffNavKey: "events",
    guestNavKey: "events",
    version: "2.0.0",
  },
  ticketing: {
    id: "ticketing",
    name: "Ticketing",
    description: "Ticket sales, capacity, and check-in",
    category: "events",
    staffNavKey: "ticketing",
    guestNavKey: "tickets",
    version: "2.0.0",
  },
  venue_booking: {
    id: "venue_booking",
    name: "Venue Booking",
    description: "Spaces, halls, and venue availability",
    category: "events",
    staffNavKey: "venues",
    guestNavKey: "venues",
    version: "2.0.0",
  },
  cinema: {
    id: "cinema",
    name: "Cinema & Entertainment",
    description: "Screens, showtimes, seating, tickets, and concessions",
    category: "events",
    staffNavKey: "cinema",
    guestNavKey: "cinema",
    version: "1.0.0",
  },
  gym_membership: {
    id: "gym_membership",
    name: "Gym, Fitness & Membership",
    description: "Memberships, classes, trainers, and check-ins",
    category: "wellness",
    staffNavKey: "gym",
    guestNavKey: "fitness",
    version: "2.0.0",
  },
  fitness_classes: {
    id: "fitness_classes",
    name: "Fitness Classes",
    description: "Class schedules and attendance",
    category: "wellness",
    staffNavKey: "fitness",
    guestNavKey: "classes",
    version: "1.0.0",
  },
  spa_services: {
    id: "spa_services",
    name: "Spa & Wellness",
    description: "Treatments, therapists, rooms, packages, and wellness facilities",
    category: "wellness",
    staffNavKey: "spa",
    guestNavKey: "spa",
    version: "2.0.0",
  },
  beauty_appointments: {
    id: "beauty_appointments",
    name: "Beauty Appointments",
    description: "Salon and beauty booking",
    category: "wellness",
    staffNavKey: "beauty",
    guestNavKey: "beauty",
    version: "1.0.0",
  },
  wellness_packages: {
    id: "wellness_packages",
    name: "Wellness Packages",
    description: "Bundled wellness offerings",
    category: "wellness",
    staffNavKey: "wellness",
    guestNavKey: "wellness",
    version: "1.0.0",
  },
  equipment_rental: {
    id: "equipment_rental",
    name: "Equipment Rental",
    description: "Rentable equipment and gear",
    category: "operations",
    staffNavKey: "rentals",
    guestNavKey: "rentals",
    version: "1.0.0",
  },
  visitor_management: {
    id: "visitor_management",
    name: "Visitor Management",
    description: "Guest and visitor check-in flows",
    category: "operations",
    staffNavKey: "visitors",
    guestNavKey: "visit",
    version: "1.0.0",
  },
  inventory: {
    id: "inventory",
    name: "Operations & Inventory",
    description: "Shared inventory, assets, maintenance, and operational tasks",
    category: "operations",
    staffNavKey: "operations",
    version: "2.0.0",
  },
  staff_management: {
    id: "staff_management",
    name: "Staff Management",
    description: "Team roster and assignments",
    category: "operations",
    staffNavKey: "staff",
    version: "1.0.0",
  },
  customer_management: {
    id: "customer_management",
    name: "CRM & Customer Management",
    description: "Unified customer profiles, timeline, segments, and consent",
    category: "operations",
    staffNavKey: "customers",
    guestNavKey: "profile",
    version: "2.0.0",
  },
  messaging: {
    id: "messaging",
    name: "Messaging",
    description: "Guest and staff messaging",
    category: "growth",
    staffNavKey: "messaging",
    guestNavKey: "messages",
    version: "1.0.0",
  },
  promotions: {
    id: "promotions",
    name: "Promotions",
    description: "Campaigns and offers",
    category: "growth",
    staffNavKey: "promotions",
    guestNavKey: "offers",
    version: "1.0.0",
  },
  loyalty: {
    id: "loyalty",
    name: "Loyalty",
    description: "Loyalty points and rewards",
    category: "growth",
    staffNavKey: "loyalty",
    guestNavKey: "loyalty",
    version: "1.0.0",
  },
  reviews: {
    id: "reviews",
    name: "Reviews",
    description: "Ratings and guest feedback",
    category: "growth",
    staffNavKey: "reviews",
    guestNavKey: "reviews",
    version: "1.0.0",
  },
  analytics: {
    id: "analytics",
    name: "Analytics",
    description: "Operational analytics dashboards",
    category: "insights",
    staffNavKey: "analytics",
    version: "1.0.0",
  },
  reporting: {
    id: "reporting",
    name: "Reporting",
    description: "Scheduled and ad-hoc reports",
    category: "insights",
    staffNavKey: "reports",
    version: "1.0.0",
  },
  notifications: {
    id: "notifications",
    name: "Communications & Notifications",
    description: "In-app notifications, templates, rules, and channel adapters",
    category: "core",
    staffNavKey: "notifications",
    guestNavKey: "notifications",
    version: "2.0.0",
  },
  billing: {
    id: "billing",
    name: "Payments & Billing",
    description: "Invoices, payments, refunds, taxes, and settlements",
    category: "core",
    staffNavKey: "billing",
    guestNavKey: "payments",
    version: "1.0.0",
  },
};

export function listModuleCatalog(): ModuleDefinition[] {
  return MODULE_IDS.map((id) => MODULE_CATALOG[id]);
}

export function isModuleId(value: string): value is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(value);
}

/** Staff roles — designed for future LifeOS Business Portal integration. */
export const STAFF_ROLES = [
  "owner",
  "admin",
  "manager",
  "front_desk",
  "operations",
  "trainer",
  "instructor",
  "spa_manager",
  "reception",
  "spa_therapist",
  "wellness_instructor",
  "event_manager",
  "venue_manager",
  "event_staff",
  "checkin_staff",
  "cinema_manager",
  "projection_staff",
  "concession_staff",
  "inventory_manager",
  "storekeeper",
  "maintenance_staff",
  "crm_manager",
  "communications_manager",
  "billing_manager",
  "billing_admin",
  "viewer",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type ActorKind = "guest" | "staff" | "system";

export interface TenantBranding {
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  theme: "light" | "dark" | "system";
  fontFamily?: string | null;
}

export interface OperatingHoursDay {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  open: string | null;
  close: string | null;
  closed: boolean;
}

export interface TenantContact {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface TenantPublic {
  id: string;
  slug: string;
  name: string;
  businessType: string;
  status: "active" | "suspended" | "pending";
  branding: TenantBranding;
  contact: TenantContact;
  operatingHours: OperatingHoursDay[];
  enabledModules: ModuleId[];
  experienceId?: string | null;
}

export interface BranchPublic {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  timezone: string;
  isPrimary: boolean;
  status: "active" | "inactive";
  contact: TenantContact;
}

export interface CustomerPublic {
  id: string;
  tenantId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  preferredLanguage?: string | null;
  timezone?: string | null;
  lifeosUserId?: string | null;
  trustId?: string | null;
  externalIdentityRef?: string | null;
  status: "active" | "blocked" | "inactive";
  preferences?: Record<string, unknown>;
  loyaltyPlaceholder?: Record<string, unknown>;
  createdAt: string;
}

export interface StaffPublic {
  id: string;
  tenantId: string;
  displayName: string;
  email: string;
  role: StaffRole;
  branchIds: string[];
  status: "active" | "inactive";
  createdAt: string;
}

export interface GuestSessionPublic {
  sessionId: string;
  tenantId: string;
  customerId: string;
  displayName: string;
  experienceId: string;
  scopes: string[];
  expiresAt: string;
}

export interface StaffSessionPublic {
  sessionId: string;
  tenantId: string;
  staffId: string;
  displayName: string;
  role: StaffRole;
  expiresAt: string;
}

/** Experience token claims (LifeOS protocol — mirrored for independent verification). */
export interface ExperienceTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  sid: string;
  exp: number;
  iat: number;
  jti: string;
  experience_id: string;
  business_id: string;
  scopes: string[];
  display_name?: string;
}

export const EXPERIENCE_TOKEN_ISSUER = "lifeos";

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

export interface HealthResponse {
  status: "ok";
  service: "hospitalityos-api";
  version: string;
  time: string;
}

/* ── Accommodation module (Sprint 2) ───────────────────────── */

export const RESERVATION_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses that hold inventory / block overlapping bookings. */
export const BLOCKING_RESERVATION_STATUSES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
];

export const HOUSEKEEPING_STATUSES = [
  "clean",
  "dirty",
  "in_progress",
  "inspected",
  "out_of_service",
] as const;

export type HousekeepingStatus = (typeof HOUSEKEEPING_STATUSES)[number];

export const MAINTENANCE_STATUSES = [
  "available",
  "scheduled",
  "under_maintenance",
  "blocked",
] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/** Maintenance states that prevent new reservations. */
export const BLOCKING_MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  "under_maintenance",
  "blocked",
];

export const ROOM_OCCUPANCY_STATUSES = ["vacant", "occupied", "reserved"] as const;
export type RoomOccupancyStatus = (typeof ROOM_OCCUPANCY_STATUSES)[number];

export const PROPERTY_TYPES = [
  "hotel",
  "resort",
  "apartment",
  "serviced_apartment",
  "guest_house",
  "hostel",
  "vacation_rental",
  "short_let",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const CALENDAR_VIEWS = ["daily", "weekly", "monthly"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export interface AccommodationPropertyPublic {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  propertyType: PropertyType | string;
  status: "active" | "inactive";
  timezone: string;
  checkInTime: string;
  checkOutTime: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  inheritBranding: boolean;
}

export interface RoomTypePublic {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  code: string;
  description?: string | null;
  capacity: number;
  bedConfiguration?: string | null;
  baseRate: number;
  currency: string;
  status: "active" | "inactive";
  amenityIds: string[];
  photoUrls: string[];
}

export interface RoomPublic {
  id: string;
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  number: string;
  floorId?: string | null;
  buildingId?: string | null;
  occupancyStatus: RoomOccupancyStatus | string;
  housekeepingStatus: HousekeepingStatus | string;
  maintenanceStatus: MaintenanceStatus | string;
  notes?: string | null;
  status: "active" | "inactive";
}

export interface ReservationPublic {
  id: string;
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  roomId?: string | null;
  customerId: string;
  status: ReservationStatus | string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  confirmationCode: string;
  internalNotes?: string | null;
  guestNotes?: string | null;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  bookingId?: string | null;
}

/* ── Universal Booking Engine (Sprint 3) ───────────────────── */

export const BOOKING_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "completed",
  "cancelled",
  "expired",
  "no_show",
  "waitlisted",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
];

export const RESOURCE_STATUSES = [
  "available",
  "unavailable",
  "maintenance",
  "blocked",
  "retired",
] as const;

export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const SCHEDULE_KINDS = [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "seasonal",
  "recurring",
] as const;

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const BOOKING_CALENDAR_VIEWS = [
  "day",
  "week",
  "month",
  "timeline",
  "agenda",
  "resource",
  "branch",
] as const;

export type BookingCalendarView = (typeof BOOKING_CALENDAR_VIEWS)[number];

export const DEFAULT_RESOURCE_CATEGORIES = [
  "accommodation",
  "dining",
  "fitness",
  "wellness",
  "events",
  "entertainment",
  "rental",
  "workspace",
  "tourism",
] as const;

export interface BookableResourcePublic {
  id: string;
  tenantId: string;
  categoryId: string;
  moduleId: string;
  branchId?: string | null;
  name: string;
  code: string;
  capacity: number;
  status: ResourceStatus | string;
  tags: string[];
  metadata: Record<string, unknown>;
  customFields: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
}

export interface BookingPublic {
  id: string;
  tenantId: string;
  customerId?: string | null;
  moduleId: string;
  status: BookingStatus | string;
  confirmationCode: string;
  startsAt: string;
  endsAt: string;
  partySize: number;
  notes?: string | null;
  internalNotes?: string | null;
  createdAt: string;
}

/* ── Universal Commerce & Catalog Engine (Sprint 4) ─────────── */

export const OFFERING_KINDS = ["service", "product", "package"] as const;
export type OfferingKind = (typeof OFFERING_KINDS)[number];

export const OFFERING_STATUSES = ["draft", "active", "archived", "featured"] as const;
export type OfferingStatus = (typeof OFFERING_STATUSES)[number];

export const OFFERING_VISIBILITY = ["public", "staff", "hidden"] as const;
export type OfferingVisibility = (typeof OFFERING_VISIBILITY)[number];

export const PRICING_RULE_KINDS = [
  "fixed",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "seasonal",
  "weekend",
  "peak",
  "off_peak",
  "member",
  "corporate",
  "custom",
] as const;
export type PricingRuleKind = (typeof PRICING_RULE_KINDS)[number];

export const PROMOTION_KINDS = [
  "percent",
  "fixed",
  "happy_hour",
  "flash",
  "bundle",
  "auto",
] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const OFFERING_RELATION_KINDS = [
  "upsell",
  "cross_sell",
  "related",
  "frequently_together",
  "upgrade",
  "suggested_package",
] as const;
export type OfferingRelationKind = (typeof OFFERING_RELATION_KINDS)[number];

export const DEFAULT_SALES_CHANNELS = [
  { code: "guest_pwa", name: "Guest PWA" },
  { code: "walk_in", name: "Walk-in" },
  { code: "reception", name: "Reception" },
  { code: "call_centre", name: "Call Centre" },
  { code: "marketplace", name: "Marketplace (future)" },
  { code: "partner_api", name: "Partner APIs (future)" },
] as const;

export interface OfferingPublic {
  id: string;
  tenantId: string;
  catalogId: string;
  categoryId?: string | null;
  kind: OfferingKind | string;
  name: string;
  code: string;
  slug: string;
  description?: string | null;
  shortDescription?: string | null;
  status: OfferingStatus | string;
  visibility: OfferingVisibility | string;
  featured: boolean;
  basePrice: number;
  currencyCode: string;
  moduleId?: string | null;
  tags: string[];
  computedPrice?: number;
  media?: Array<{ id: string; url: string; isCover: boolean; altText?: string | null }>;
}

export interface PriceQuote {
  offeringId: string;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  currencyCode: string;
  appliedRules: string[];
  appliedPromotions: string[];
  couponCode?: string | null;
}

/* ── Restaurant & Dining Module (Sprint 5) ──────────────────── */

export const TABLE_STATUSES = [
  "available",
  "reserved",
  "occupied",
  "cleaning",
  "out_of_service",
] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const DINING_RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show",
  "waitlisted",
] as const;
export type DiningReservationStatus = (typeof DINING_RESERVATION_STATUSES)[number];

export const DINING_ORDER_STATUSES = [
  "draft",
  "submitted",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
] as const;
export type DiningOrderStatus = (typeof DINING_ORDER_STATUSES)[number];

export const DINING_ORDER_TYPES = [
  "dine_in",
  "takeaway",
  "delivery",
  "room_service",
] as const;
export type DiningOrderType = (typeof DINING_ORDER_TYPES)[number];

export const KITCHEN_TICKET_STATUSES = [
  "queued",
  "preparing",
  "ready",
  "served",
  "cancelled",
] as const;
export type KitchenTicketStatus = (typeof KITCHEN_TICKET_STATUSES)[number];

export const DINING_AREA_TYPES = [
  "indoor",
  "outdoor",
  "lounge",
  "bar",
  "rooftop",
  "beach",
  "food_court",
  "cafe",
  "private",
] as const;
export type DiningAreaType = (typeof DINING_AREA_TYPES)[number];

/* ── Gym, Fitness & Membership Module (Sprint 6) ────────────── */

export const MEMBERSHIP_STATUSES = [
  "draft",
  "pending",
  "active",
  "frozen",
  "expired",
  "cancelled",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "cancelled",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ACCESS_PASS_KINDS = ["day_pass", "guest_pass", "trial_pass"] as const;
export type AccessPassKind = (typeof ACCESS_PASS_KINDS)[number];

export const FITNESS_AREA_TYPES = [
  "gym_floor",
  "cardio",
  "weights",
  "studio",
  "pool",
  "boxing",
  "sauna",
  "outdoor",
  "other",
] as const;
export type FitnessAreaType = (typeof FITNESS_AREA_TYPES)[number];

/* ── Spa & Wellness Module (Sprint 7) ───────────────────────── */

export const SPA_ROOM_TYPES = [
  "massage",
  "facial",
  "couples",
  "vip",
  "consultation",
  "other",
] as const;
export type SpaRoomType = (typeof SPA_ROOM_TYPES)[number];

export const WELLNESS_AREA_TYPES = [
  "sauna",
  "steam",
  "jacuzzi",
  "pool",
  "meditation",
  "wellness",
  "other",
] as const;
export type WellnessAreaType = (typeof WELLNESS_AREA_TYPES)[number];

export const SPA_APPOINTMENT_STATUSES = [
  "draft",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type SpaAppointmentStatus = (typeof SPA_APPOINTMENT_STATUSES)[number];

export const SPA_ROOM_STATUSES = [
  "available",
  "occupied",
  "cleaning",
  "maintenance",
  "out_of_service",
] as const;
export type SpaRoomStatus = (typeof SPA_ROOM_STATUSES)[number];

/** Roles allowed to read/write consultation & treatment notes. */
export const SPA_SENSITIVE_NOTE_ROLES = [
  "owner",
  "admin",
  "spa_manager",
  "spa_therapist",
] as const;

/* ── Events & Venues Module (Sprint 8) ──────────────────────── */

export const EVENT_STATUSES = [
  "draft",
  "published",
  "open",
  "sold_out",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const TICKET_STATUSES = [
  "reserved",
  "confirmed",
  "cancelled",
  "used",
  "refunded",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CHECKIN_STATUSES = [
  "not_checked_in",
  "checked_in",
  "cancelled",
  "no_show",
] as const;
export type CheckInStatus = (typeof CHECKIN_STATUSES)[number];

export const VENUE_TYPES = [
  "ballroom",
  "conference_hall",
  "wedding_hall",
  "auditorium",
  "outdoor",
  "rooftop",
  "exhibition_hall",
  "meeting_room",
  "studio",
  "theatre",
  "other",
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const SEATING_MODES = ["general_admission", "assigned"] as const;
export type SeatingMode = (typeof SEATING_MODES)[number];

/* ── Cinema & Entertainment Module (Sprint 9) ───────────────── */

export const SHOWTIME_STATUSES = [
  "draft",
  "scheduled",
  "on_sale",
  "sold_out",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type ShowtimeStatus = (typeof SHOWTIME_STATUSES)[number];

export const SCREEN_TYPES = [
  "standard",
  "premium",
  "imax",
  "vip",
  "private",
  "outdoor",
  "other",
] as const;
export type ScreenType = (typeof SCREEN_TYPES)[number];

export const CINEMA_SEAT_STATUSES = [
  "available",
  "held",
  "booked",
  "blocked",
  "unavailable",
] as const;
export type CinemaSeatStatus = (typeof CINEMA_SEAT_STATUSES)[number];

export const CONTENT_RATINGS = [
  "G",
  "PG",
  "PG-13",
  "R",
  "NC-17",
  "U",
  "12A",
  "15",
  "18",
  "NR",
] as const;
export type ContentRating = (typeof CONTENT_RATINGS)[number];

export const CONCESSION_ORDER_STATUSES = [
  "draft",
  "submitted",
  "preparing",
  "ready",
  "collected",
  "cancelled",
] as const;
export type ConcessionOrderStatus = (typeof CONCESSION_ORDER_STATUSES)[number];

export const SEAT_HOLD_STATUSES = ["active", "converted", "expired", "released"] as const;
export type SeatHoldStatus = (typeof SEAT_HOLD_STATUSES)[number];

/* ── Operations & Inventory (Sprint 10) ─────────────────────── */

export const INVENTORY_UNITS = [
  "piece",
  "box",
  "pack",
  "kilogram",
  "gram",
  "litre",
  "millilitre",
  "meter",
] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const INVENTORY_TX_TYPES = [
  "purchase",
  "receipt",
  "consumption",
  "adjustment",
  "transfer",
  "damage",
  "waste",
  "return",
  "stock_count",
] as const;
export type InventoryTxType = (typeof INVENTORY_TX_TYPES)[number];

export const PURCHASE_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "completed",
  "cancelled",
] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

export const ASSET_STATUSES = [
  "active",
  "available",
  "assigned",
  "maintenance",
  "damaged",
  "retired",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_MAINTENANCE_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type AssetMaintenanceStatus = (typeof ASSET_MAINTENANCE_STATUSES)[number];

export const OPS_TASK_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type OpsTaskStatus = (typeof OPS_TASK_STATUSES)[number];

export const STOCK_COUNT_STATUSES = ["draft", "in_progress", "submitted", "cancelled"] as const;
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number];

/* ── CRM & Customer Management (Sprint 11) ──────────────────── */

export const CRM_NOTE_VISIBILITIES = ["internal", "restricted"] as const;
export type CrmNoteVisibility = (typeof CRM_NOTE_VISIBILITIES)[number];

export const CRM_CONSENT_STATUSES = ["granted", "withdrawn"] as const;
export type CrmConsentStatus = (typeof CRM_CONSENT_STATUSES)[number];

export const CRM_INTERACTION_TYPES = [
  "phone_call",
  "email",
  "in_person",
  "support_request",
  "follow_up",
  "general",
] as const;
export type CrmInteractionType = (typeof CRM_INTERACTION_TYPES)[number];

export const CRM_FEEDBACK_STATUSES = ["new", "reviewed", "resolved", "archived"] as const;
export type CrmFeedbackStatus = (typeof CRM_FEEDBACK_STATUSES)[number];

export const CRM_EVENT_TYPES = [
  "BOOKING_CREATED",
  "BOOKING_CANCELLED",
  "STAY_COMPLETED",
  "ORDER_COMPLETED",
  "MEMBERSHIP_STARTED",
  "CLASS_ATTENDED",
  "SPA_APPOINTMENT_COMPLETED",
  "EVENT_ATTENDED",
  "CINEMA_TICKET_USED",
  "PURCHASE",
  "FEEDBACK",
  "INTERACTION",
  "VISIT",
  "CUSTOM",
] as const;
export type CrmEventType = (typeof CRM_EVENT_TYPES)[number];

export const LOYALTY_STATUSES = ["none", "enrolled", "active", "paused", "closed"] as const;
export type LoyaltyStatus = (typeof LOYALTY_STATUSES)[number];

/* ── Communications & Notifications (Sprint 12) ─────────────── */

export const NOTIFICATION_CATEGORIES = [
  "booking",
  "reservation",
  "appointment",
  "order",
  "payment",
  "membership",
  "event",
  "cinema",
  "accommodation",
  "promotion",
  "operational",
  "security",
  "system",
  "marketing",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_STATUSES = ["unread", "read", "archived", "expired"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms", "push", "whatsapp"] as const;
export type NotificationChannelId = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_AUDIENCES = ["customer", "staff"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const DELIVERY_STATUSES = [
  "pending",
  "processing",
  "sent",
  "delivered",
  "failed",
  "skipped",
  "cancelled",
  "blocked",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const TEMPLATE_TYPES = ["transactional", "operational", "marketing", "system"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const SCHEDULE_STATUSES = ["pending", "processing", "completed", "cancelled", "failed"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const COMMUNICATION_EVENT_TYPES = [
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "APPOINTMENT_REMINDER",
  "ORDER_CREATED",
  "ORDER_READY",
  "MEMBERSHIP_STARTED",
  "MEMBERSHIP_EXPIRING",
  "EVENT_TICKET_BOOKED",
  "EVENT_REMINDER",
  "CINEMA_SHOWTIME_REMINDER",
  "WAITLIST_AVAILABLE",
  "INVENTORY_LOW",
  "MAINTENANCE_CREATED",
  "PURCHASE_REQUEST_CREATED",
  "STAY_BOOKED",
  "CHECKIN_REMINDER",
  "CHECKOUT_REMINDER",
  "RESTAURANT_RESERVATION_CONFIRMED",
  "CLASS_REMINDER",
  "AFTERCARE_AVAILABLE",
  "TICKET_CONFIRMED",
  "SHOWTIME_REMINDER",
  "LOW_STOCK",
  "MAINTENANCE_ASSIGNED",
  "FEEDBACK_REQUEST",
  "CUSTOM",
] as const;
export type CommunicationEventType = (typeof COMMUNICATION_EVENT_TYPES)[number];

export const ALLOWED_TEMPLATE_VARIABLES = [
  "customer.firstName",
  "customer.lastName",
  "customer.displayName",
  "business.name",
  "booking.reference",
  "booking.date",
  "booking.time",
  "venue.name",
  "experience.name",
  "order.reference",
] as const;

/* ── Payments & Billing (Sprint 13) ─────────────────────────── */

export const SUPPORTED_CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** ISO-4217 minor-unit exponents (no floating money). */
export const CURRENCY_EXPONENTS: Record<SupportedCurrency, number> = {
  NGN: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
};

export interface Money {
  amount: number; // integer minor units
  currency: SupportedCurrency | string;
}

export const BILLING_ACCOUNT_STATUSES = ["active", "suspended", "closed"] as const;
export type BillingAccountStatus = (typeof BILLING_ACCOUNT_STATUSES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "open",
  "partially_paid",
  "paid",
  "void",
  "overdue",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_INTENT_STATUSES = [
  "created",
  "requires_action",
  "authorized",
  "captured",
  "cancelled",
  "failed",
  "expired",
] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "captured",
  "cancelled",
  "failed",
  "refunded",
  "partially_refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = [
  "requested",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const PAYMENT_METHOD_TYPES = ["card", "bank_transfer", "wallet", "cash", "other"] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const BILLABLE_ITEM_TYPES = [
  "ACCOMMODATION_RESERVATION",
  "RESTAURANT_ORDER",
  "FITNESS_MEMBERSHIP",
  "SPA_APPOINTMENT",
  "EVENT_TICKET",
  "CINEMA_TICKET",
  "COMMERCE_ORDER",
  "PRODUCT_PURCHASE",
  "PACKAGE_PURCHASE",
  "CUSTOM",
] as const;
export type BillableItemType = (typeof BILLABLE_ITEM_TYPES)[number];

export const SETTLEMENT_STATUSES = ["pending", "processing", "settled", "failed"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const BILLING_PERMISSIONS = [
  "billing.view",
  "billing.create",
  "billing.update",
  "billing.refund",
  "billing.cash",
  "billing.settlement",
  "billing.tax",
  "billing.admin",
] as const;
export type BillingPermission = (typeof BILLING_PERMISSIONS)[number];

/** Role → billing permission map (financial roles are not universal). */
export const BILLING_ROLE_PERMISSIONS: Record<string, readonly BillingPermission[]> = {
  owner: BILLING_PERMISSIONS,
  admin: BILLING_PERMISSIONS,
  billing_admin: BILLING_PERMISSIONS,
  billing_manager: [
    "billing.view",
    "billing.create",
    "billing.update",
    "billing.refund",
    "billing.cash",
    "billing.settlement",
    "billing.tax",
  ],
  manager: ["billing.view", "billing.create", "billing.update", "billing.cash", "billing.refund"],
  front_desk: ["billing.view", "billing.cash"],
  reception: ["billing.view", "billing.cash"],
  operations: ["billing.view"],
  viewer: ["billing.view"],
};

export function staffHasBillingPermission(role: string, permission: BillingPermission): boolean {
  const perms = BILLING_ROLE_PERMISSIONS[role] ?? [];
  return perms.includes(permission) || perms.includes("billing.admin");
}

