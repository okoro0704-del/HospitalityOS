import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { prisma } from "../../db.js";

const CAPABILITY = "identity.currentActor";

function key() {
  const secret = process.env.SESSION_SECRET || "dev-only-session-secret-change-me";
  return scryptSync(secret, "hos-pdi-vault", 32);
}

export function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function open(payload: string) {
  const [iv, tag, encrypted] = payload.split(".");
  if (!iv || !tag || !encrypted) throw new Error("PDI_VAULT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

let ready: Promise<void> | null = null;

export function ensurePdiVault() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pdi_identity_links (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_kind TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      trust_id_subject TEXT NOT NULL,
      digi_owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, actor_kind, actor_id)
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pdi_session_vault (
      hospitality_session_id TEXT PRIMARY KEY,
      actor_kind TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      digi_owner_id TEXT NOT NULL,
      session_cipher TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pdi_application_vault (
      id TEXT PRIMARY KEY,
      digi_owner_id TEXT NOT NULL,
      infrastructure_id TEXT NOT NULL,
      application_id TEXT NOT NULL,
      credential_cipher TEXT NOT NULL,
      UNIQUE (digi_owner_id, infrastructure_id)
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pdi_connection_cache (
      digi_owner_id TEXT NOT NULL,
      infrastructure_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      status TEXT NOT NULL,
      grant_id TEXT,
      PRIMARY KEY (digi_owner_id, infrastructure_id)
    )`);
  })();
  return ready;
}

export type ActorRef = { tenantId: string; actorKind: "guest" | "staff"; actorId: string; hospitalitySessionId: string };

export async function saveIdentity(input: ActorRef & { trustIdSubject: string; digiOwnerId: string }) {
  await ensurePdiVault();
  const now = new Date().toISOString();
  await prisma.$executeRaw`
    INSERT INTO pdi_identity_links (id, tenant_id, actor_kind, actor_id, trust_id_subject, digi_owner_id, created_at, updated_at)
    VALUES (${randomBytes(12).toString("hex")}, ${input.tenantId}, ${input.actorKind}, ${input.actorId}, ${input.trustIdSubject}, ${input.digiOwnerId}, ${now}, ${now})
    ON CONFLICT(tenant_id, actor_kind, actor_id) DO UPDATE SET
      trust_id_subject = excluded.trust_id_subject,
      digi_owner_id = excluded.digi_owner_id,
      updated_at = excluded.updated_at
  `;
}

export async function saveDigiSession(input: ActorRef & { digiOwnerId: string; sessionToken: string; expiresAt: string }) {
  await ensurePdiVault();
  const cipher = seal(input.sessionToken);
  await prisma.$executeRaw`
    INSERT INTO pdi_session_vault (hospitality_session_id, actor_kind, actor_id, digi_owner_id, session_cipher, expires_at)
    VALUES (${input.hospitalitySessionId}, ${input.actorKind}, ${input.actorId}, ${input.digiOwnerId}, ${cipher}, ${input.expiresAt})
    ON CONFLICT(hospitality_session_id) DO UPDATE SET
      session_cipher = excluded.session_cipher,
      digi_owner_id = excluded.digi_owner_id,
      expires_at = excluded.expires_at
  `;
}

export async function readDigiSession(hospitalitySessionId: string) {
  await ensurePdiVault();
  const rows = await prisma.$queryRaw<Array<{ digi_owner_id: string; session_cipher: string; expires_at: string; actor_id: string; actor_kind: string }>>`
    SELECT digi_owner_id, session_cipher, expires_at, actor_id, actor_kind FROM pdi_session_vault WHERE hospitality_session_id = ${hospitalitySessionId}
  `;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return { expired: true as const, digiOwnerId: row.digi_owner_id };
  return { expired: false as const, digiOwnerId: row.digi_owner_id, sessionToken: open(row.session_cipher), actorId: row.actor_id };
}

export async function saveApplication(input: { digiOwnerId: string; infrastructureId: string; applicationId: string; credential: string }) {
  await ensurePdiVault();
  await prisma.$executeRaw`
    INSERT INTO pdi_application_vault (id, digi_owner_id, infrastructure_id, application_id, credential_cipher)
    VALUES (${randomBytes(12).toString("hex")}, ${input.digiOwnerId}, ${input.infrastructureId}, ${input.applicationId}, ${seal(input.credential)})
    ON CONFLICT(digi_owner_id, infrastructure_id) DO UPDATE SET
      application_id = excluded.application_id,
      credential_cipher = excluded.credential_cipher
  `;
}

export async function readApplication(digiOwnerId: string, infrastructureId: string) {
  await ensurePdiVault();
  const rows = await prisma.$queryRaw<Array<{ application_id: string; credential_cipher: string }>>`
    SELECT application_id, credential_cipher FROM pdi_application_vault
    WHERE digi_owner_id = ${digiOwnerId} AND infrastructure_id = ${infrastructureId}
  `;
  const row = rows[0];
  if (!row) return null;
  return { applicationId: row.application_id, credential: open(row.credential_cipher) };
}

export async function saveConnectionCache(input: { digiOwnerId: string; infrastructureId: string; connectionId: string; status: string; grantId?: string | null }) {
  await ensurePdiVault();
  await prisma.$executeRaw`
    INSERT INTO pdi_connection_cache (digi_owner_id, infrastructure_id, connection_id, status, grant_id)
    VALUES (${input.digiOwnerId}, ${input.infrastructureId}, ${input.connectionId}, ${input.status}, ${input.grantId ?? null})
    ON CONFLICT(digi_owner_id, infrastructure_id) DO UPDATE SET
      connection_id = excluded.connection_id,
      status = excluded.status,
      grant_id = excluded.grant_id
  `;
}

export async function readIdentity(tenantId: string, actorKind: string, actorId: string) {
  await ensurePdiVault();
  const rows = await prisma.$queryRaw<Array<{ trust_id_subject: string; digi_owner_id: string }>>`
    SELECT trust_id_subject, digi_owner_id FROM pdi_identity_links
    WHERE tenant_id = ${tenantId} AND actor_kind = ${actorKind} AND actor_id = ${actorId}
  `;
  const row = rows[0];
  return row ? { trustIdSubject: row.trust_id_subject, digiOwnerId: row.digi_owner_id } : null;
}

export { CAPABILITY };
