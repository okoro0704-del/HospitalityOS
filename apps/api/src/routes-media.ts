import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getStorageProvider, type UploadAssetOptions } from "@hospitalityos/shared";
import { prisma } from "./db.js";
import { requirePermission } from "./lib/permissions.js";
import { requireStaff, tenantNotFound, type StaffAuth } from "./lib/auth.js";
import { writeAudit } from "./lib/audit.js";
import {
  readPrivateObject,
  verifyMediaAccess,
} from "./services/media-storage.js";

function mapErr(err: unknown) {
  const e = err as { statusCode?: number; code?: string; message?: string };
  return {
    status: e.statusCode ?? 500,
    body: {
      error: e.code ?? "internal_error",
      message: e.message ?? "Unexpected error",
    },
  };
}

function toCategory(kind?: string): UploadAssetOptions["category"] {
  switch ((kind ?? "").toLowerCase()) {
    case "menu":
      return "MENU";
    case "room_gallery":
    case "room":
      return "ROOM_GALLERY";
    case "avatar":
    case "user_avatar":
      return "USER_AVATAR";
    default:
      return "DOCUMENT";
  }
}

export async function registerMediaRoutes(app: FastifyInstance) {
  /** Binary upload (base64) — private by default. */
  app.post(
    "/media/upload",
    { preHandler: [requirePermission("media.write")] },
    async (req, reply) => {
      try {
        const body = z
          .object({
            filename: z.string().min(1).max(200),
            contentType: z.string().min(3).max(120),
            dataBase64: z.string().min(1),
            kind: z.string().optional(),
            altText: z.string().optional(),
            offeringId: z.string().optional(),
            isPublic: z.boolean().optional(),
          })
          .parse(req.body);

        let bytes: Buffer;
        try {
          bytes = Buffer.from(body.dataBase64, "base64");
        } catch {
          return reply.code(400).send({ error: "validation_error", message: "Invalid base64" });
        }

        const storage = getStorageProvider();
        const stored = await storage.upload(bytes, {
          tenantId: req.tenantId!,
          category: toCategory(body.kind),
          contentType: body.contentType,
          isPublic: body.isPublic ?? false,
          ...({ filename: body.filename } as object),
        } as Parameters<typeof storage.upload>[1]);

        const media = await prisma.mediaAsset.create({
          data: {
            tenantId: req.tenantId!,
            url: stored.url,
            storageKey: stored.assetId,
            contentType: body.contentType,
            byteSize: stored.sizeBytes,
            checksum: stored.hash,
            kind: body.kind ?? "document",
            altText: body.altText,
            offeringId: body.offeringId,
            isPublic: body.isPublic ?? false,
          },
        });

        await writeAudit({
          tenantId: req.tenantId!,
          actorKind: "staff",
          actorId: (req.auth as StaffAuth).staffId,
          action: "media.uploaded",
          resource: "media_asset",
          resourceId: media.id,
          metadata: {
            contentType: body.contentType,
            byteSize: stored.sizeBytes,
            kind: media.kind,
          },
        });

        return {
          media: {
            id: media.id,
            tenantId: media.tenantId,
            kind: media.kind,
            contentType: media.contentType,
            byteSize: media.byteSize,
            isPublic: media.isPublic,
            createdAt: media.createdAt.toISOString(),
            private: true,
          },
        };
      } catch (err) {
        const m = mapErr(err);
        return reply.code(m.status).send(m.body);
      }
    },
  );

  /** Issue short-lived signed download URL. */
  app.post(
    "/media/:id/signed-url",
    { preHandler: [requirePermission("media.read")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      z.object({ ttlSeconds: z.number().int().positive().max(86_400).optional() }).parse(req.body ?? {});
      const media = await prisma.mediaAsset.findFirst({
        where: { id, tenantId: req.tenantId!, deletedAt: null },
      });
      if (!media) return tenantNotFound(reply);
      if (!media.storageKey) {
        return reply.code(400).send({
          error: "validation_error",
          message: "Media has no private storage object",
        });
      }

      const url = await getStorageProvider().getDownloadUrl(media.id);
      const expMatch = /[?&]exp=(\d+)/.exec(url);
      const expiresAt = expMatch
        ? new Date(Number(expMatch[1]) * 1000).toISOString()
        : new Date(Date.now() + 300_000).toISOString();

      await writeAudit({
        tenantId: req.tenantId!,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
        action: "media.signed_url",
        resource: "media_asset",
        resourceId: media.id,
        metadata: { expiresAt },
      });

      return {
        mediaId: media.id,
        url,
        expiresAt,
      };
    },
  );

  /**
   * Stream private bytes.
   * Auth: staff session (same tenant) OR valid signed query (exp+sig).
   */
  app.get("/media/:id/content", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { exp?: string; sig?: string };

    const media = await prisma.mediaAsset.findFirst({ where: { id } });
    if (!media || media.deletedAt) {
      return reply.code(404).send({ error: "not_found", message: "Media not found" });
    }
    if (!media.storageKey) {
      return reply.code(404).send({ error: "not_found", message: "No private content" });
    }

    let authorized = false;
    if (q.exp && q.sig) {
      const check = verifyMediaAccess({
        mediaId: media.id,
        tenantId: media.tenantId,
        expUnix: Number(q.exp),
        sig: q.sig,
      });
      if (!check.ok) {
        return reply.code(check.code === "validation_error" ? 400 : 401).send({
          error: check.code,
          message: check.message,
        });
      }
      authorized = true;
    } else {
      await requireStaff(req, reply);
      if (reply.sent) return;
      if (req.tenantId !== media.tenantId) {
        return reply.code(404).send({ error: "not_found", message: "Media not found" });
      }
      authorized = true;
    }

    if (!authorized) {
      return reply.code(401).send({ error: "unauthorized", message: "Authorization required" });
    }

    try {
      const bytes = await readPrivateObject(media.tenantId, media.storageKey);
      reply.header("Content-Type", media.contentType ?? "application/octet-stream");
      reply.header("Content-Length", String(bytes.length));
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Cache-Control", "private, no-store");
      return reply.send(bytes);
    } catch (err) {
      const m = mapErr(err);
      return reply.code(m.status).send(m.body);
    }
  });

  app.delete(
    "/media/:id",
    { preHandler: [requirePermission("media.write")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const media = await prisma.mediaAsset.findFirst({
        where: { id, tenantId: req.tenantId!, deletedAt: null },
      });
      if (!media) return tenantNotFound(reply);

      const deleted = await getStorageProvider().delete(media.id);
      if (!deleted) return tenantNotFound(reply);

      await writeAudit({
        tenantId: req.tenantId!,
        actorKind: "staff",
        actorId: (req.auth as StaffAuth).staffId,
        action: "media.deleted",
        resource: "media_asset",
        resourceId: media.id,
      });

      return { ok: true };
    },
  );
}
