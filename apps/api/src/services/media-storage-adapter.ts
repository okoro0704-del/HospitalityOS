import { randomBytes } from "node:crypto";
import type {
  IStorageProvider,
  StoredAsset,
  UploadAssetOptions,
} from "@hospitalityos/shared";
import { prisma } from "../db.js";
import {
  buildSignedContentPath,
  deletePrivateObject,
  writePrivateObject,
} from "./media-storage.js";

const CATEGORY_TO_KIND: Record<UploadAssetOptions["category"], string> = {
  MENU: "menu",
  ROOM_GALLERY: "room_gallery",
  DOCUMENT: "document",
  USER_AVATAR: "avatar",
};

/**
 * Local disk storage adapter — wraps private filesystem + HMAC signed URLs.
 *
 * - `upload` returns `assetId` = storage key (blob locator).
 * - `getDownloadUrl` / `delete` expect HospitalityOS `MediaAsset.id`
 *   (domain creates the asset row after upload).
 */
export class LocalDiskStorageAdapter implements IStorageProvider {
  async upload(fileBuffer: Buffer, options: UploadAssetOptions): Promise<StoredAsset> {
    const hint = (options as UploadAssetOptions & { filename?: string }).filename;
    const filename =
      hint?.trim() || `${CATEGORY_TO_KIND[options.category]}_${randomBytes(4).toString("hex")}`;
    const stored = await writePrivateObject({
      tenantId: options.tenantId,
      originalName: filename,
      contentType: options.contentType,
      bytes: fileBuffer,
    });
    return {
      assetId: stored.storageKey,
      url: stored.url,
      hash: stored.checksum,
      sizeBytes: stored.byteSize,
    };
  }

  async getDownloadUrl(assetId: string): Promise<string> {
    const media = await prisma.mediaAsset.findFirst({
      where: { id: assetId, deletedAt: null },
    });
    if (!media) {
      throw Object.assign(new Error("Media asset not found"), {
        statusCode: 404,
        code: "not_found",
      });
    }
    const signed = buildSignedContentPath({
      mediaId: media.id,
      tenantId: media.tenantId,
    });
    return signed.path;
  }

  async delete(assetId: string): Promise<boolean> {
    const media = await prisma.mediaAsset.findFirst({
      where: { id: assetId, deletedAt: null },
    });
    if (!media) return false;
    await prisma.mediaAsset.update({
      where: { id: media.id },
      data: { deletedAt: new Date() },
    });
    if (media.storageKey) {
      await deletePrivateObject(media.tenantId, media.storageKey);
    }
    return true;
  }
}

export { CATEGORY_TO_KIND };
