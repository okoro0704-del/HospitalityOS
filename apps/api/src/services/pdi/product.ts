import { randomUUID } from "node:crypto";
import { writeAudit } from "../../lib/audit.js";
import { HospitalityDdiClient, issueAuthorityToken, projectConnection, type DdiConnection } from "./ddi-client.js";
import { InfrastructureError } from "./endpoints.js";
import { CAPABILITY, COMMUNICATION_CAPABILITY, readApplication, readCommunicationGrant, readDigiSession, readIdentity, saveApplication, saveCommunicationGrant, saveConnectionCache } from "./vault.js";

export type PdiActor = { tenantId: string; actorKind: "guest" | "staff"; actorId: string; hospitalitySessionId: string };

export type PdiSurface = {
  digi: "READY" | "UNAVAILABLE" | "EXPIRED";
  infrastructure: "NOT_PROVISIONED" | "ACTIVE" | "UNAVAILABLE";
  connection: "NOT_CONNECTED" | "REQUESTED" | "ACTIVE" | "REVOKED";
  capability: typeof CAPABILITY;
  message: string;
  execution?: { status: string; reason?: string; ownerId?: string };
};

const client = () => new HospitalityDdiClient();

async function context(actor: PdiActor) {
  const session = await readDigiSession(actor.hospitalitySessionId);
  if (!session) throw new InfrastructureError("DIGI_UNAVAILABLE", "Digi Core has not established an owner session for this login", 503);
  if (session.expired) throw new InfrastructureError("DIGI_SESSION_EXPIRED", "The Digi session expired. Sign in again to continue with your PDI.", 401);
  return session;
}

function surfaceFrom(connection: DdiConnection | null, infrastructure: PdiSurface["infrastructure"], digi: PdiSurface["digi"] = "READY"): PdiSurface {
  const connectionState = projectConnection(connection?.status);
  const message = infrastructure === "NOT_PROVISIONED"
    ? "Your Personal Digital Infrastructure has not been created."
    : connectionState === "ACTIVE"
      ? "HospitalityOS can use your current Digi Owner."
      : connectionState === "REQUESTED"
        ? "HospitalityOS is waiting for you to approve access."
        : connectionState === "REVOKED"
          ? "PDI access was revoked."
          : "HospitalityOS is not connected to your PDI.";
  return { digi, infrastructure, connection: infrastructure === "ACTIVE" ? connectionState : "NOT_CONNECTED", capability: CAPABILITY, message };
}

async function personal(actor: PdiActor) {
  const session = await context(actor);
  let found: { state: string; infrastructure?: { id: string } };
  try { found = await client().findPersonal(session.sessionToken); }
  catch (error) {
    if (error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("DDI_UNAVAILABLE", "DDI is unavailable", 503);
  }
  if (found.state !== "ACTIVE" || !found.infrastructure?.id) return { session, infrastructureId: null as string | null, connection: null as DdiConnection | null };
  const app = await readApplication(session.digiOwnerId, found.infrastructure.id);
  return { session, infrastructureId: found.infrastructure.id, app };
}

export async function pdiSurface(actor: PdiActor): Promise<PdiSurface> {
  try {
    const current = await personal(actor);
    if (!current.infrastructureId) return surfaceFrom(null, "NOT_PROVISIONED");
    const rows = await (await import("../../db.js")).prisma.$queryRaw<Array<{ connection_id: string; status: string; grant_id: string | null }>>`
      SELECT connection_id, status, grant_id FROM pdi_connection_cache
      WHERE digi_owner_id = ${current.session.digiOwnerId} AND infrastructure_id = ${current.infrastructureId}
    `;
    const cached = rows[0];
    if (!cached) return surfaceFrom(null, "ACTIVE");
    try {
      const live = await client().getConnection(current.session.sessionToken, cached.connection_id);
      const grantId = live.authorityGrantRefs?.find((item) => item.capability === CAPABILITY)?.grantId ?? null;
      await saveConnectionCache({ digiOwnerId: current.session.digiOwnerId, infrastructureId: current.infrastructureId, connectionId: live.id, status: live.status, grantId });
      return surfaceFrom(live, "ACTIVE");
    } catch (error) {
      if (error instanceof InfrastructureError && (error.code === "DIGI_SESSION_EXPIRED" || error.code === "DDI_UNAVAILABLE")) throw error;
      return surfaceFrom({ id: cached.connection_id, status: cached.status }, "ACTIVE");
    }
  } catch (error) {
    if (error instanceof InfrastructureError && error.code === "DIGI_SESSION_EXPIRED") {
      return { digi: "EXPIRED", infrastructure: "UNAVAILABLE", connection: "NOT_CONNECTED", capability: CAPABILITY, message: error.message };
    }
    return { digi: "UNAVAILABLE", infrastructure: "UNAVAILABLE", connection: "NOT_CONNECTED", capability: CAPABILITY, message: "Digiconomy infrastructure is unavailable." };
  }
}

export async function createPersonalPdi(actor: PdiActor) {
  const session = await context(actor);
  const existing = await client().findPersonal(session.sessionToken);
  if (existing.state === "ACTIVE" && existing.infrastructure?.id) return pdiSurface(actor);
  const created = await client().createPersonal(session.sessionToken, `pdi-create:${session.digiOwnerId}`);
  if (created.ownerId !== session.digiOwnerId) throw new InfrastructureError("OWNER_MISMATCH", "DDI returned a different Digi Owner", 403);
  await writeAudit({ tenantId: actor.tenantId, actorKind: actor.actorKind, actorId: actor.actorId, action: "PDI_LOOKUP", resource: "pdi", metadata: { result: "CREATED" } });
  return pdiSurface(actor);
}

async function productCredential(sessionToken: string, digiOwnerId: string, infrastructureId: string) {
  const existing = await readApplication(digiOwnerId, infrastructureId);
  if (existing) return existing;
  const registered = await client().registerProduct(sessionToken, infrastructureId, `hospitalityos:${infrastructureId}`);
  if (!registered.applicationCredential) throw new InfrastructureError("APPLICATION_CREDENTIAL_REJECTED", "DDI did not issue a product credential", 503);
  await saveApplication({ digiOwnerId, infrastructureId, applicationId: registered.id, credential: registered.applicationCredential });
  return { applicationId: registered.id, credential: registered.applicationCredential };
}

export async function connectPdi(actor: PdiActor) {
  const current = await personal(actor);
  if (!current.infrastructureId) throw new InfrastructureError("PDI_NOT_PROVISIONED", "Create your Personal Digital Infrastructure before connecting.", 409);
  const product = await productCredential(current.session.sessionToken, current.session.digiOwnerId, current.infrastructureId);
  let connection: DdiConnection;
  try {
    connection = await client().requestConnection(product.credential, current.infrastructureId, `hospitalityos-connect:${randomUUID()}`);
  } catch (error) {
    if (error instanceof InfrastructureError && error.code === "CONNECTION_ALREADY_ACTIVE") return pdiSurface(actor);
    throw error;
  }
  await saveConnectionCache({ digiOwnerId: current.session.digiOwnerId, infrastructureId: current.infrastructureId, connectionId: connection.id, status: connection.status, grantId: connection.authorityGrantRefs?.find((item) => item.capability === CAPABILITY)?.grantId ?? null });
  await writeAudit({ tenantId: actor.tenantId, actorKind: actor.actorKind, actorId: actor.actorId, action: "PDI_CONNECTION_REQUESTED", resource: "pdi_connection", metadata: { status: connection.status } });
  return surfaceFrom(connection, "ACTIVE");
}

async function cachedConnection(actor: PdiActor) {
  const current = await personal(actor);
  if (!current.infrastructureId) throw new InfrastructureError("PDI_NOT_PROVISIONED", "Your Personal Digital Infrastructure has not been created.", 409);
  const rows = await (await import("../../db.js")).prisma.$queryRaw<Array<{ connection_id: string; status: string; grant_id: string | null }>>`
    SELECT connection_id, status, grant_id FROM pdi_connection_cache
    WHERE digi_owner_id = ${current.session.digiOwnerId} AND infrastructure_id = ${current.infrastructureId}
  `;
  const row = rows[0];
  if (!row) throw new InfrastructureError("NOT_CONNECTED", "HospitalityOS is not connected to your PDI.", 409);
  return { ...current, connectionId: row.connection_id, grantId: row.grant_id, connectionStatus: row.status };
}

export async function approvePdi(actor: PdiActor) {
  const current = await cachedConnection(actor);
  const approved = await client().approve(current.session.sessionToken, current.connectionId);
  await saveConnectionCache({ digiOwnerId: current.session.digiOwnerId, infrastructureId: current.infrastructureId!, connectionId: approved.id, status: approved.status, grantId: approved.authorityGrantRefs?.find((item) => item.capability === CAPABILITY)?.grantId ?? null });
  await writeAudit({ tenantId: actor.tenantId, actorKind: actor.actorKind, actorId: actor.actorId, action: "PDI_CONNECTION_ACTIVE", resource: "pdi_connection", metadata: { status: approved.status } });
  return surfaceFrom(approved, "ACTIVE");
}

export async function executeCurrentActor(actor: PdiActor, executionMode: "APP" | "SPACE" = "APP") {
  const current = await cachedConnection(actor);
  const product = await readApplication(current.session.digiOwnerId, current.infrastructureId!);
  if (!product) throw new InfrastructureError("APPLICATION_CREDENTIAL_REJECTED", "HospitalityOS is not registered on this PDI.", 401);
  if (current.connectionStatus !== "ACTIVE" || !current.grantId) {
    return { ...surfaceFrom({ id: current.connectionId, status: current.connectionStatus }, "ACTIVE"), execution: { status: "DENIED", reason: "CONNECTION_NOT_ACTIVE" } };
  }
  const authorityToken = await issueAuthorityToken(current.session.sessionToken, current.grantId);
  if (!authorityToken) {
    return { ...surfaceFrom({ id: current.connectionId, status: current.connectionStatus }, "ACTIVE"), execution: { status: "DENIED", reason: "CONNECTION_NOT_ACTIVE" } };
  }
  let result: { status: string; reason?: string; data?: { ownerId?: string } };
  try {
    result = await client().execute(product.credential, executionMode, authorityToken);
  } catch (error) {
    if (error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("DDI_UNAVAILABLE", "DDI is unavailable", 503);
  }
  if (result.status !== "COMPLETED") {
    await writeAudit({ tenantId: actor.tenantId, actorKind: actor.actorKind, actorId: actor.actorId, action: "PDI_CAPABILITY_EXECUTED", resource: "identity.currentActor", metadata: { status: result.status, reason: result.reason ?? null, executionMode } });
    return { ...surfaceFrom({ id: current.connectionId, status: result.reason === "CONNECTION_NOT_ACTIVE" ? "REVOKED" : "ACTIVE" }, "ACTIVE"), execution: { status: result.status, reason: result.reason } };
  }
  if (result.data?.ownerId && result.data.ownerId !== current.session.digiOwnerId) {
    throw new InfrastructureError("OWNER_MISMATCH", "The PDI returned a different Digi Owner", 403);
  }
  await writeAudit({ tenantId: actor.tenantId, actorKind: actor.actorKind, actorId: actor.actorId, action: "PDI_CAPABILITY_EXECUTED", resource: "identity.currentActor", metadata: { status: "COMPLETED", executionMode } });
  return { ...surfaceFrom({ id: current.connectionId, status: "ACTIVE" }, "ACTIVE"), execution: { status: "COMPLETED", ownerId: result.data?.ownerId } };
}

export async function revokePdi(actor: PdiActor) {
  const current = await cachedConnection(actor);
  const revoked = await client().revoke(current.session.sessionToken, current.connectionId);
  await saveConnectionCache({ digiOwnerId: current.session.digiOwnerId, infrastructureId: current.infrastructureId!, connectionId: revoked.id, status: revoked.status, grantId: null });
  await saveCommunicationGrant({ digiOwnerId: current.session.digiOwnerId, infrastructureId: current.infrastructureId!, grantId: null });
  await writeAudit({ tenantId: actor.tenantId, actorKind: actor.actorKind, actorId: actor.actorId, action: "PDI_CONNECTION_REVOKED", resource: "pdi_connection", metadata: { status: revoked.status } });
  return surfaceFrom(revoked, "ACTIVE");
}

export async function requestCommunication(actor: PdiActor) {
  const current = await cachedConnection(actor);
  if (current.connectionStatus !== "ACTIVE") {
    return { capability: COMMUNICATION_CAPABILITY, connection: projectConnection(current.connectionStatus), execution: { status: "DENIED", reason: "CONNECTION_NOT_ACTIVE" } };
  }
  const product = await readApplication(current.session.digiOwnerId, current.infrastructureId!);
  if (!product) throw new InfrastructureError("APPLICATION_CREDENTIAL_REJECTED", "HospitalityOS is not registered on this PDI.", 401);
  try {
    await client().requestCapability(product.credential, current.connectionId, COMMUNICATION_CAPABILITY);
  } catch (error) {
    if (!(error instanceof InfrastructureError) || error.code !== "CAPABILITY_ALREADY_APPROVED") throw error;
  }
  return { capability: COMMUNICATION_CAPABILITY, connection: "REQUESTED" as const, message: "HospitalityOS is requesting access to your conversations." };
}

export async function approveCommunication(actor: PdiActor) {
  const current = await cachedConnection(actor);
  const approved = await client().approveCapabilities(current.session.sessionToken, current.connectionId, [COMMUNICATION_CAPABILITY]);
  const grantId = approved.authorityGrantRefs?.find((item) => item.capability === COMMUNICATION_CAPABILITY)?.grantId ?? null;
  await saveCommunicationGrant({ digiOwnerId: current.session.digiOwnerId, infrastructureId: current.infrastructureId!, grantId });
  await saveConnectionCache({ digiOwnerId: current.session.digiOwnerId, infrastructureId: current.infrastructureId!, connectionId: approved.id, status: approved.status, grantId: approved.authorityGrantRefs?.find((item) => item.capability === CAPABILITY)?.grantId ?? current.grantId });
  return { capability: COMMUNICATION_CAPABILITY, connection: projectConnection(approved.status) };
}

export async function executeCommunication(actor: PdiActor, executionMode: "APP" | "SPACE" = "APP") {
  const current = await cachedConnection(actor);
  const product = await readApplication(current.session.digiOwnerId, current.infrastructureId!);
  if (!product) throw new InfrastructureError("APPLICATION_CREDENTIAL_REJECTED", "HospitalityOS is not registered on this PDI.", 401);
  const communicationGrant = await readCommunicationGrant(current.session.digiOwnerId, current.infrastructureId!);
  const grantId = communicationGrant ?? current.grantId;
  if (!grantId) return { capability: COMMUNICATION_CAPABILITY, connection: projectConnection(current.connectionStatus), execution: { status: "DENIED", reason: "CONNECTION_NOT_ACTIVE" } };
  const authorityToken = await issueAuthorityToken(current.session.sessionToken, grantId);
  if (!authorityToken) return { capability: COMMUNICATION_CAPABILITY, connection: projectConnection(current.connectionStatus), execution: { status: "DENIED", reason: "CONNECTION_NOT_ACTIVE" } };
  const result = await client().execute(product.credential, executionMode, authorityToken, COMMUNICATION_CAPABILITY);
  if (result.status !== "COMPLETED") {
    return { capability: COMMUNICATION_CAPABILITY, connection: projectConnection(current.connectionStatus), execution: { status: result.status, reason: result.reason } };
  }
  if (result.data?.ownerId && result.data.ownerId !== current.session.digiOwnerId) {
    throw new InfrastructureError("OWNER_MISMATCH", "The PDI returned a different Digi Owner", 403);
  }
  return { capability: COMMUNICATION_CAPABILITY, connection: "ACTIVE" as const, execution: { status: "COMPLETED", provider: result.provider, ownerId: result.data?.ownerId, accountRef: result.data?.accountRef, threads: result.data?.threads ?? [] } };
}

export async function pdiTestDiagnostics(actor: PdiActor) {
  if (process.env.NODE_ENV === "production") return null;
  const identity = await readIdentity(actor.tenantId, actor.actorKind, actor.actorId);
  const session = await readDigiSession(actor.hospitalitySessionId);
  return {
    trustIdSubject: identity?.trustIdSubject ?? null,
    digiOwnerId: identity?.digiOwnerId ?? null,
    sessionReady: Boolean(session && !session.expired),
    hospitalityActorId: actor.actorId,
  };
}
