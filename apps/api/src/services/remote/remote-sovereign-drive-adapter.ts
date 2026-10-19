import type {
  IStorageProvider,
  StoredAsset,
  UploadAssetOptions,
} from "@hospitalityos/shared";
import { resolveAccessToken, type AccessTokenFactory } from "./access-token.js";

export interface RemoteSovereignDriveAdapterOptions {
  /** Base URL of Sovereign Drive, e.g. http://localhost:4100 */
  baseUrl: string;
  getAccessToken: AccessTokenFactory;
  fetchFn?: typeof fetch;
}

/**
 * Remote Storage adapter — proxies IStorageProvider to Sovereign Drive `/v1/storage`.
 */
export class RemoteSovereignDriveAdapter implements IStorageProvider {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenFactory;
  private readonly fetchFn: typeof fetch;

  constructor(opts: RemoteSovereignDriveAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.getAccessToken = opts.getAccessToken;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async upload(fileBuffer: Buffer, options: UploadAssetOptions): Promise<StoredAsset> {
    const token = await resolveAccessToken(this.getAccessToken);
    const hint = (options as UploadAssetOptions & { filename?: string }).filename;
    const filename = hint?.trim() || `${options.category.toLowerCase()}.bin`;

    const form = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: options.contentType });
    form.append("file", blob, filename);
    form.append("contentType", options.contentType);
    form.append("tenantId", options.tenantId);
    form.append("category", options.category);
    form.append("private", String(options.isPublic !== true));
    form.append("filename", filename);

    const res = await this.fetchFn(`${this.baseUrl}/v1/storage/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Sovereign Drive upload failed (${res.status}): ${errBody}`);
    }

    const data = (await res.json()) as StoredAsset & {
      id?: string;
      sizeBytes?: number;
      hash?: string;
      url?: string;
    };

    return {
      assetId: data.assetId ?? data.id ?? "",
      url: data.url ?? "",
      hash: data.hash ?? "",
      sizeBytes: data.sizeBytes ?? fileBuffer.byteLength,
    };
  }

  async getDownloadUrl(assetId: string): Promise<string> {
    const token = await resolveAccessToken(this.getAccessToken);
    const res = await this.fetchFn(`${this.baseUrl}/v1/storage/asset/${encodeURIComponent(assetId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Sovereign Drive getDownloadUrl failed (${res.status}): ${errBody}`);
    }

    const body = (await res.json()) as { url: string };
    return body.url;
  }

  async delete(assetId: string): Promise<boolean> {
    const token = await resolveAccessToken(this.getAccessToken);
    const res = await this.fetchFn(`${this.baseUrl}/v1/storage/asset/${encodeURIComponent(assetId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return false;
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Sovereign Drive delete failed (${res.status}): ${errBody}`);
    }

    const body = (await res.json()) as { deleted?: boolean };
    return Boolean(body.deleted ?? true);
  }
}
