import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireStaff, type StaffAuth } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import {
  createBusinessPublication,
  getPublicPublicationById,
  listLifeOsPublicFeed,
  streamPublicMediaAsset,
} from "../services/lifeos-public-feed.js";

/**
 * Unauthenticated LifeOS discovery + staff business publication publish.
 * HospitalityOS remains owner; LifeOS consumes URLs only.
 */
export async function registerLifeOsPublicRoutes(app: FastifyInstance) {
  app.get("/v1/public/lifeos/feed", async (req) => {
    const query = z
      .object({
        cursor: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
        kind: z.enum(["offering", "publication", "all"]).optional(),
        tenantSlug: z.string().min(1).optional(),
      })
      .parse(req.query ?? {});
    const result = await listLifeOsPublicFeed(query);
    return { ...result, count: result.items.length };
  });

  app.get("/v1/public/publications/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const row = await getPublicPublicationById(params.id);
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/v1/public/media/:assetId", async (req, reply) => {
    const params = z.object({ assetId: z.string().min(1) }).parse(req.params);
    const media = await streamPublicMediaAsset(params.assetId);
    if (!media) return reply.code(404).send({ error: "not_found" });
    return reply
      .header("Content-Type", media.contentType)
      .header("Cache-Control", "public, max-age=300")
      .header("X-Content-Type-Options", "nosniff")
      .send(Buffer.from(media.body));
  });

  app.post("/staff/publications", { preHandler: [requireStaff] }, async (req, reply) => {
    const auth = req.auth as StaffAuth;
    const body = z
      .object({
        type: z.enum(["photo", "video", "post"]),
        title: z.string().max(200).optional(),
        caption: z.string().max(4000).optional(),
        mediaAssetIds: z.array(z.string().min(1)).min(1).max(12),
        relatedOfferingId: z.string().min(1).nullable().optional(),
        publishNow: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    try {
      const pub = await createBusinessPublication({
        tenantId: auth.tenantId,
        type: body.type,
        title: body.title,
        caption: body.caption,
        mediaAssetIds: body.mediaAssetIds,
        relatedOfferingId: body.relatedOfferingId,
        publishNow: body.publishNow,
      });
      await writeAudit({
        tenantId: auth.tenantId,
        actorKind: "staff",
        actorId: auth.staffId,
        action: "business_publication.created",
        resource: "business_publication",
        resourceId: pub.id,
      });
      return reply.code(201).send({ publication: pub });
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      return reply.code(e.statusCode ?? 500).send({
        error: e.code ?? "internal_error",
        message: e.message ?? "Unexpected error",
      });
    }
  });
}
