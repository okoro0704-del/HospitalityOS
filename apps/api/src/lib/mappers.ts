import type {
  BranchPublic,
  CustomerPublic,
  GuestSessionPublic,
  ModuleId,
  OperatingHoursDay,
  StaffPublic,
  StaffRole,
  StaffSessionPublic,
  TenantBranding,
  TenantContact,
  TenantPublic,
} from "@hospitalityos/shared";
import type {
  Branch,
  Customer,
  GuestSession,
  StaffMember,
  StaffSession,
  Tenant,
  TenantModule,
} from "@prisma/client";
import { parseJsonArray } from "./crypto.js";

export function toOperatingHours(value: unknown): OperatingHoursDay[] {
  if (!Array.isArray(value)) return [];
  return value as OperatingHoursDay[];
}

export function toTenantPublic(
  tenant: Tenant,
  modules: TenantModule[],
): TenantPublic {
  const branding: TenantBranding = {
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
    accentColor: tenant.accentColor,
    theme: tenant.theme as TenantBranding["theme"],
    fontFamily: tenant.fontFamily,
  };
  const contact: TenantContact = {
    email: tenant.email,
    phone: tenant.phone,
    website: tenant.website,
    addressLine1: tenant.addressLine1,
    addressLine2: tenant.addressLine2,
    city: tenant.city,
    region: tenant.region,
    postalCode: tenant.postalCode,
    country: tenant.country,
  };
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    businessType: tenant.businessType,
    status: tenant.status as TenantPublic["status"],
    branding,
    contact,
    operatingHours: toOperatingHours(tenant.operatingHours),
    enabledModules: modules
      .filter((m) => m.enabled)
      .map((m) => m.moduleId as ModuleId),
    experienceId: tenant.experienceId,
  };
}

export function toBranchPublic(branch: Branch): BranchPublic {
  return {
    id: branch.id,
    tenantId: branch.tenantId,
    name: branch.name,
    code: branch.code,
    timezone: branch.timezone,
    isPrimary: branch.isPrimary,
    status: branch.status as BranchPublic["status"],
    contact: {
      email: branch.email,
      phone: branch.phone,
      addressLine1: branch.addressLine1,
      city: branch.city,
      region: branch.region,
      postalCode: branch.postalCode,
      country: branch.country,
    },
  };
}

export function toCustomerPublic(customer: Customer): CustomerPublic {
  return {
    id: customer.id,
    tenantId: customer.tenantId,
    displayName: customer.displayName,
    email: customer.email,
    phone: customer.phone,
    lifeosUserId: customer.lifeosUserId,
    trustId: customer.trustId,
    status: customer.status as CustomerPublic["status"],
    preferences: (customer.preferences as Record<string, unknown>) ?? {},
    loyaltyPlaceholder: (customer.loyaltyPlaceholder as Record<string, unknown>) ?? {},
    createdAt: customer.createdAt.toISOString(),
  };
}

export function toStaffPublic(staff: StaffMember): StaffPublic {
  return {
    id: staff.id,
    tenantId: staff.tenantId,
    displayName: staff.displayName,
    email: staff.email,
    role: staff.role as StaffRole,
    branchIds: parseJsonArray(staff.branchIds),
    status: staff.status as StaffPublic["status"],
    createdAt: staff.createdAt.toISOString(),
  };
}

export function toGuestSessionPublic(session: GuestSession): GuestSessionPublic {
  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    customerId: session.customerId,
    displayName: session.displayName,
    experienceId: session.experienceId,
    scopes: parseJsonArray(session.scopes),
    expiresAt: session.expiresAt.toISOString(),
  };
}

export function toStaffSessionPublic(session: StaffSession & { staff?: StaffMember }): StaffSessionPublic {
  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    staffId: session.staffId,
    displayName: session.staff?.displayName ?? "Staff",
    role: session.role as StaffRole,
    expiresAt: session.expiresAt.toISOString(),
  };
}
