import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { config } from "../../config.js";
import { provisionHospitalityTenant } from "../../services/distributor/provision-tenant.js";

function bearerEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * LifeOS Portal / Master Distributor → HospitalityOS install handshake.
 * POST /internal/distributor/provision
 */
export async function registerInternalProvisionRoutes(app: FastifyInstance) {
  app.post("/internal/distributor/provision", async (req, reply) => {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || !bearerEquals(token, config.internalProvisionToken)) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Valid service bearer token required",
      });
    }

    const body = z
      .object({
        distributorTenantId: z.string().min(1).optional(),
        tenantId: z.string().min(1).optional(),
        subdomain: z.string().min(1).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i),
        slug: z.string().min(1).optional(),
        displayName: z.string().min(1),
        customDomain: z.string().optional(),
        brand: z
          .object({
            primaryColor: z.string().optional(),
            logoUrl: z.string().url().optional(),
          })
          .optional(),
        oauthDestinations: z.array(z.string()).optional(),
        modules: z.array(z.string()).optional(),
        enabledModules: z.array(z.string()).optional(),
        installTemplate: z.string().optional(),
        businessType: z.string().optional(),
        propertyType: z.string().optional(),
        localFood: z
          .object({
            defaultPrepBufferMins: z.number().int().positive().max(240).optional(),
            deliveryRadiusKm: z.number().positive().max(100).optional(),
            fundzmanInstantPayout: z.boolean().optional(),
          })
          .optional(),
        seed: z.enum(["default", "none"]).optional(),
        trustId: z
          .object({
            audience: z.string().optional(),
            businessPublicId: z.string().optional(),
          })
          .optional(),
        adminStaff: z
          .object({
            email: z.string().email(),
            displayName: z.string().min(1),
            role: z.string().optional(),
            password: z.string().min(8).optional(),
          })
          .optional(),
        organization: z
          .object({
            slug: z.string().optional(),
            name: z.string().optional(),
          })
          .optional(),
        manifestVersion: z.string().optional(),
      })
      .refine((v) => Boolean(v.distributorTenantId ?? v.tenantId), {
        message: "distributorTenantId or tenantId is required",
      })
      .parse(req.body);

    try {
      const result = await provisionHospitalityTenant({
        distributorTenantId: body.distributorTenantId ?? body.tenantId!,
        tenantId: body.tenantId,
        subdomain: body.subdomain,
        slug: body.slug,
        displayName: body.displayName,
        customDomain: body.customDomain,
        brand: body.brand,
        oauthDestinations: body.oauthDestinations,
        modules: body.modules,
        enabledModules: body.enabledModules,
        installTemplate: body.installTemplate,
        businessType: body.businessType,
        propertyType: body.propertyType,
        localFood: body.localFood,
        seed: body.seed,
        trustId: body.trustId,
        adminStaff: body.adminStaff,
        organization: body.organization,
        manifestVersion: body.manifestVersion,
      });
      return reply.code(201).send(result);
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      return reply.code(e.statusCode ?? 500).send({
        error: e.code ?? "provision_failed",
        message: e.message ?? "Provision failed",
      });
    }
  });
}
