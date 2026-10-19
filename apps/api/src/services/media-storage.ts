import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const DEFAULT_ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
];

export function mediaRoot(): string {
  return path.resolve(config.mediaRoot);
}

export function mediaMaxBytes(): number {
  return config.mediaMaxBytes;
}

export function mediaAllowedTypes(): Set<string> {
  return new Set(config.mediaAllowedTypes.length ? config.mediaAllowedTypes : DEFAULT_ALLOWED);
}

export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return base || "file";
}

export function buildStorageKey(tenantId: string, originalName: string): string {
  const stamp = Date.now().toString(36);
  const rand = randomBytes(8).toString("hex");
  return path.posix.join(tenantId, `${stamp}_${rand}_${safeFilename(originalName)}`);
}

export function assertSafeStorageKey(tenantId: string, storageKey: string) {
  if (!storageKey.startsWith(`${tenantId}/`) && !storageKey.startsWith(`${tenantId}\\`)) {
    throw Object.assign(new Error("Invalid storage key"), { statusCode: 400, code: "validation_error" });
  }
  if (storageKey.includes("..") || path.isAbsolute(storageKey)) {
    throw Object.assign(new Error("Invalid storage key"), { statusCode: 400, code: "validation_error" });
  }
}

export async function writePrivateObject(opts: {
  tenantId: string;
  originalName: string;
  contentType: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; byteSize: number; checksum: string; url: string }> {
  const allowed = mediaAllowedTypes();
  if (!allowed.has(opts.contentType)) {
    throw Object.assign(new Error("Content type not allowed"), {
      statusCode: 400,
      code: "validation_error",
    });
  }
  if (opts.bytes.length === 0) {
    throw Object.assign(new Error("Empty file"), { statusCode: 400, code: "validation_error" });
  }
  if (opts.bytes.length > mediaMaxBytes()) {
    throw Object.assign(new Error("File exceeds size limit"), {
      statusCode: 400,
      code: "validation_error",
    });
  }

  const storageKey = buildStorageKey(opts.tenantId, opts.originalName);
  assertSafeStorageKey(opts.tenantId, storageKey);
  const abs = path.join(mediaRoot(), storageKey);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, opts.bytes, { flag: "wx" });
  const checksum = createHash("sha256").update(opts.bytes).digest("hex");
  return {
    storageKey,
    byteSize: opts.bytes.length,
    checksum,
    url: `private://${storageKey}`,
  };
}

export async function readPrivateObject(tenantId: string, storageKey: string): Promise<Buffer> {
  assertSafeStorageKey(tenantId, storageKey);
  const abs = path.join(mediaRoot(), storageKey);
  const root = mediaRoot();
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw Object.assign(new Error("Invalid storage path"), { statusCode: 400, code: "validation_error" });
  }
  try {
    return await fs.readFile(resolved);
  } catch {
    throw Object.assign(new Error("Media file not found"), { statusCode: 404, code: "not_found" });
  }
}

export async function deletePrivateObject(tenantId: string, storageKey: string): Promise<void> {
  assertSafeStorageKey(tenantId, storageKey);
  const abs = path.join(mediaRoot(), storageKey);
  await fs.unlink(abs).catch(() => undefined);
}

function signingSecret(): string {
  return config.mediaSigningSecret || config.sessionSecret;
}

export function signMediaAccess(opts: {
  mediaId: string;
  tenantId: string;
  expUnix: number;
}): string {
  const payload = `${opts.mediaId}.${opts.tenantId}.${opts.expUnix}`;
  return createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

export function verifyMediaAccess(opts: {
  mediaId: string;
  tenantId: string;
  expUnix: number;
  sig: string;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (!Number.isFinite(opts.expUnix) || opts.expUnix <= 0) {
    return { ok: false, code: "validation_error", message: "Invalid expiry" };
  }
  if (Math.floor(Date.now() / 1000) > opts.expUnix) {
    return { ok: false, code: "unauthorized", message: "Signed URL expired" };
  }
  const expected = signMediaAccess({
    mediaId: opts.mediaId,
    tenantId: opts.tenantId,
    expUnix: opts.expUnix,
  });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(opts.sig || "", "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: "unauthorized", message: "Invalid signature" };
  }
  return { ok: true };
}

export function buildSignedContentPath(opts: {
  mediaId: string;
  tenantId: string;
  ttlSeconds?: number;
}): { path: string; expiresAt: string; exp: number; sig: string } {
  const ttl = Math.min(Math.max(opts.ttlSeconds ?? 300, 30), 86_400);
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = signMediaAccess({ mediaId: opts.mediaId, tenantId: opts.tenantId, expUnix: exp });
  return {
    path: `/media/${opts.mediaId}/content?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    exp,
    sig,
  };
}
