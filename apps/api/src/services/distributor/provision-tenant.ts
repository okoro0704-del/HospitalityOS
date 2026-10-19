import { createHash, randomBytes } from "node:crypto";
import {
  HOSPITALITYOS_MANIFEST,
  businessTypeForSuite,
  folioChargeEnabled,
  posSettlementMethods,
  resolveInstallTemplate,
  resolveProvisionModules,
  seedForBusinessType,
} from "@hospitalityos/shared";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { hashPassword } from "../../lib/crypto.js";
import { writeAudit } from "../../lib/audit.js";
import {
  seedAccommodationDefaults,
  seedBarDefaults,
  seedDiningDefaults,
  seedEventsDefaults,
  seedGymSpaDefaults,
  seedPlatformDefaults,
} from "./provision-seed.js";

export type ProvisionTenantInput = {
  distributorTenantId: string;
  tenantId?: string;
  subdomain: string;
  slug?: string;
  displayName: string;
  customDomain?: string;
  brand?: { primaryColor?: string; logoUrl?: string };
  oauthDestinations?: string[];
  modules?: string[];
  enabledModules?: string[];
  /** Portal install template id e.g. standalone_shared_homes */
  installTemplate?: string;
  businessType?: string;
  propertyType?: string;
  /** Wizard overrides for local_food installs */
  localFood?: {
    defaultPrepBufferMins?: number;
    deliveryRadiusKm?: number;
    fundzmanInstantPayout?: boolean;
  };
  seed?: "default" | "none";
  trustId?: { audience?: string; businessPublicId?: string };
  adminStaff?: { email: string; displayName: string; role?: string; password?: string };
  organization?: { slug?: string; name?: string };
  manifestVersion?: string;
};

function launchUrl(template: string, subdomain: string): string {
  return template.replaceAll("{subdomain}", subdomain);
}

/**
 * Provision a HospitalityOS tenant from Master Distributor / LifeOS Portal payload.
 * Seeds only the suite modules requested in `enabledModules` (or legacy `modules`).
 */
export async function provisionHospitalityTenant(input: ProvisionTenantInput) {
  const slug = (input.slug ?? input.subdomain).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const seedMode = input.seed ?? "default";
  const template = resolveInstallTemplate(input.installTemplate, input.enabledModules ?? input.modules);
  const resolved = resolveProvisionModules({
    enabledModules: input.enabledModules ?? (input.installTemplate ? template.modules : undefined),
    modules: input.modules ?? (input.installTemplate ? template.modules : undefined),
  });
  const suite = resolved.suite;
  if (suite.includes("local_food")) {
    // The Local Food module has no persisted data model in this build (deferred in H0).
    throw Object.assign(new Error("The local_food module is not available in this build"), {
      statusCode: 400,
      code: "module_unavailable",
    });
  }
  const modules = resolved.internal;
  const businessType =
    input.businessType ??
    (input.installTemplate ? template.businessType : businessTypeForSuite(suite));
  const propertyType =
    input.propertyType ??
    template.propertyType ??
    (suite.includes("shared_homes") ? "shared_home" : "hotel");
  const seed = seedForBusinessType(businessType);
  const folioEnabled = folioChargeEnabled(suite);
  const settlement = posSettlementMethods(suite);
  const hours = [
    { day: "mon", open: "09:00", close: "17:00", closed: false },
    { day: "tue", open: "09:00", close: "17:00", closed: false },
    { day: "wed", open: "09:00", close: "17:00", closed: false },
    { day: "thu", open: "09:00", close: "17:00", closed: false },
    { day: "fri", open: "09:00", close: "17:00", closed: false },
    { day: "sat", open: null, close: null, closed: true },
    { day: "sun", open: null, close: null, closed: true },
  ];

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    throw Object.assign(new Error(`Tenant slug already exists: ${slug}`), {
      statusCode: 409,
      code: "conflict",
    });
  }

  const orgSlug =
    input.organization?.slug ?? `${slug}-group`.replace(/[^a-z0-9-]/g, "-");
  const organization = await prisma.organization.upsert({
    where: { slug: orgSlug },
    create: {
      slug: orgSlug,
      name: input.organization?.name ?? `${input.displayName} Group`,
      status: "active",
      metadata: { distributorTenantId: input.distributorTenantId },
    },
    update: {
      name: input.organization?.name ?? `${input.displayName} Group`,
    },
  });

  const tenant = await prisma.tenant.create({
    data: {
      organizationId: organization.id,
      slug,
      name: input.displayName,
      businessType,
      status: "active",
      lifeosBusinessId: input.trustId?.businessPublicId ?? input.distributorTenantId,
      logoUrl: input.brand?.logoUrl,
      primaryColor: input.brand?.primaryColor ?? HOSPITALITYOS_MANIFEST.brandDefaults.primaryColor,
      operatingHours: hours,
      settings: {
        distributorTenantId: input.distributorTenantId,
        customDomain: input.customDomain ?? null,
        oauthDestinations: input.oauthDestinations ?? HOSPITALITYOS_MANIFEST.install.oauthDestinations,
        trustIdAudience: input.trustId?.audience ?? config.trustidAudience,
        manifestVersion: input.manifestVersion ?? HOSPITALITYOS_MANIFEST.version,
        provisionedAt: new Date().toISOString(),
        enabledModules: suite,
        installTemplate: input.installTemplate ?? template.id,
        propertyType,
        folioChargeEnabled: folioEnabled,
        posSettlementMethods: settlement,
      },
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: "Main",
      code: "MAIN",
      isPrimary: true,
      timezone: "UTC",
    },
  });

  for (const moduleId of modules) {
    await prisma.tenantModule.create({
      data: { tenantId: tenant.id, moduleId, enabled: true, config: {} },
    });
  }

  const adminEmail =
    input.adminStaff?.email ?? `owner@${slug}.hospitality.local`;
  const adminPassword = input.adminStaff?.password ?? `Tmp-${randomBytes(6).toString("hex")}!`;
  const staff = await prisma.staffMember.create({
    data: {
      tenantId: tenant.id,
      displayName: input.adminStaff?.displayName ?? "Owner",
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: input.adminStaff?.role ?? "owner",
      branchIds: [branch.id],
      status: "active",
    },
  });

  if (seedMode === "default") {
    await seedPlatformDefaults({ tenantId: tenant.id, seed });

    const suiteSet = new Set(suite);
    if (suiteSet.has("accommodation") || suiteSet.has("shared_homes")) {
      await seedAccommodationDefaults({
        tenantId: tenant.id,
        branchId: branch.id,
        displayName: input.displayName,
        seed,
        propertyType,
      });
    }
    if (suiteSet.has("dining")) {
      await seedDiningDefaults({ tenantId: tenant.id, displayName: input.displayName });
    }
    if (suiteSet.has("bar")) {
      await seedBarDefaults({ tenantId: tenant.id, displayName: input.displayName });
    }
    if (suiteSet.has("gym_spa")) {
      await seedGymSpaDefaults({ tenantId: tenant.id, displayName: input.displayName });
    }
    if (suiteSet.has("events")) {
      await seedEventsDefaults({ tenantId: tenant.id, displayName: input.displayName });
    }
  }

  await writeAudit({
    tenantId: tenant.id,
    actorKind: "system",
    action: "distributor.provision",
    resource: "tenant",
    resourceId: tenant.id,
    metadata: {
      distributorTenantId: input.distributorTenantId,
      slug,
      modules,
      enabledModules: suite,
      folioChargeEnabled: folioEnabled,
      posSettlementMethods: settlement,
      seed: seedMode,
      roles: seed.roles.map((r) => r.role),
      fingerprint: createHash("sha256").update(`${slug}:${tenant.id}`).digest("hex").slice(0, 16),
    },
  });

  return {
    ok: true as const,
    hosTenantId: tenant.id,
    organizationId: organization.id,
    branchId: branch.id,
    staffId: staff.id,
    slug: tenant.slug,
    modulesEnabled: modules,
    enabledModules: suite,
    folioChargeEnabled: folioEnabled,
    posSettlementMethods: settlement,
    seedApplied: seedMode === "default",
    roles: seed.roles,
    temporaryAdminPassword: input.adminStaff?.password ? undefined : adminPassword,
    launchUrls: {
      staff: launchUrl(config.staffLaunchUrlTemplate, slug),
      guest: launchUrl(config.guestLaunchUrlTemplate, slug),
    },
  };
}
