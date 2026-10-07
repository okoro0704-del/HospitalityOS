import { ddiBaseUrl, digiCoreBaseUrl, InfrastructureError } from "./endpoints.js";
import { CAPABILITY, COMMUNICATION_CAPABILITY } from "./vault.js";

export type DdiConnection = {
  id: string;
  status: string;
  approvedCapabilities?: string[];
  authorityGrantRefs?: Array<{ grantId: string; capability: string }>;
};

async function readBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return {}; }
}

function fail(response: Response, body: Record<string, unknown>, fallback: string, credential: "owner" | "application" = "owner") {
  const code = typeof body.code === "string" ? body.code : fallback;
  if (response.status >= 500 || code === "AUTHORITY_GRANT_UNAVAILABLE" || code === "AUTHORITY_GRANT_NOT_REUSABLE") {
    throw new InfrastructureError(code === "UNAVAILABLE" ? "DDI_UNAVAILABLE" : code, "Personal Digital Infrastructure is unavailable", 503);
  }
  if (response.status === 401) {
    throw new InfrastructureError(credential === "application" ? "APPLICATION_CREDENTIAL_REJECTED" : "DIGI_SESSION_EXPIRED", "Infrastructure authentication was rejected", 401);
  }
  throw new InfrastructureError(code, "The Personal Digital Infrastructure request was not accepted", response.status === 409 ? 409 : 400);
}

export async function exchangeDigiAssertion(assertion: string) {
  const base = digiCoreBaseUrl();
  if (!base) throw new InfrastructureError("DIGI_UNAVAILABLE", "Digi Core is not configured", 503);
  let response: Response;
  try {
    response = await fetch(new URL("/auth/trustid/exchange", base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assertion }),
    });
  } catch {
    throw new InfrastructureError("DIGI_UNAVAILABLE", "Digi Core is unavailable", 503);
  }
  const body = await readBody(response);
  if (!response.ok || typeof body.ownerId !== "string" || typeof body.sessionToken !== "string") {
    throw new InfrastructureError("DIGI_UNAVAILABLE", "Digi Core did not establish an owner session", 503);
  }
  return { ownerId: body.ownerId, sessionToken: body.sessionToken, expiresAt: String(body.expiresAt ?? "") };
}

export class HospitalityDdiClient {
  private base: string;
  constructor(base = ddiBaseUrl()) { this.base = base; }

  private async send(path: string, init: RequestInit) {
    if (!this.base) throw new InfrastructureError("DDI_UNAVAILABLE", "DDI is not configured", 503);
    let response: Response;
    try { response = await fetch(new URL(path, this.base), init); }
    catch { throw new InfrastructureError("DDI_UNAVAILABLE", "DDI is unavailable", 503); }
    const body = await readBody(response);
    const authorization = new Headers(init.headers).get("authorization") ?? "";
    if (!response.ok) fail(response, body, "DDI_UNAVAILABLE", authorization.startsWith("Application ") ? "application" : "owner");
    return body;
  }

  findPersonal(sessionToken: string) {
    return this.send("/me/pdi", { headers: { authorization: `Bearer ${sessionToken}` } }) as Promise<{ state: string; infrastructure?: { id: string } }>;
  }

  createPersonal(sessionToken: string, idempotencyKey: string) {
    return this.send("/me/pdi", {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: "{}",
    }) as Promise<{ id: string; ownerId: string; type: string }>;
  }

  registerProduct(sessionToken: string, infrastructureId: string, idempotencyKey: string) {
    return this.send(`/infrastructures/${encodeURIComponent(infrastructureId)}/apps`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ type: "REFERENCE", displayName: "HospitalityOS", capabilities: [CAPABILITY, COMMUNICATION_CAPABILITY] }),
    }) as Promise<{ id: string; applicationCredential?: string }>;
  }

  requestConnection(credential: string, infrastructureId: string, idempotencyKey: string) {
    return this.send(`/infrastructures/${encodeURIComponent(infrastructureId)}/connections`, {
      method: "POST",
      headers: { authorization: `Application ${credential}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ capabilities: [CAPABILITY] }),
    }) as Promise<DdiConnection>;
  }

  approve(sessionToken: string, connectionId: string) {
    return this.approveCapabilities(sessionToken, connectionId, [CAPABILITY]);
  }

  approveCapabilities(sessionToken: string, connectionId: string, capabilities: string[]) {
    return this.send(`/connections/${encodeURIComponent(connectionId)}/approve`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capabilities }),
    }) as Promise<DdiConnection>;
  }

  requestCapability(credential: string, connectionId: string, capability: string) {
    return this.send(`/connections/${encodeURIComponent(connectionId)}/capabilities/request`, {
      method: "POST",
      headers: { authorization: `Application ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({ capabilities: [capability] }),
    }) as Promise<DdiConnection>;
  }

  getConnection(sessionToken: string, connectionId: string) {
    return this.send(`/connections/${encodeURIComponent(connectionId)}`, {
      headers: { authorization: `Bearer ${sessionToken}` },
    }) as Promise<DdiConnection>;
  }

  revoke(sessionToken: string, connectionId: string) {
    return this.send(`/connections/${encodeURIComponent(connectionId)}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
      body: "{}",
    }) as Promise<DdiConnection>;
  }

  async execute(credential: string, executionMode: "APP" | "SPACE", authorityToken: string, capability = CAPABILITY) {
    if (!this.base) throw new InfrastructureError("DDI_UNAVAILABLE", "DDI is not configured", 503);
    let response: Response;
    try {
      response = await fetch(new URL("/capabilities/execute", this.base), {
        method: "POST",
        headers: { authorization: `Application ${credential}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, executionMode, authorityToken }),
      });
    } catch {
      throw new InfrastructureError("DDI_UNAVAILABLE", "DDI is unavailable", 503);
    }
    const body = await readBody(response);
    if (typeof body.status === "string" && (response.ok || body.status === "DENIED" || body.status === "CAPABILITY_UNAVAILABLE" || body.status === "FAILED" || body.status === "AUTHENTICATION_REQUIRED")) {
      return body as { status: string; reason?: string; provider?: string; data?: { ownerId?: string; accountRef?: string; threads?: Array<{ id: string; channel: string; peerRef?: string; unreadCount?: number }> } };
    }
    if (!response.ok) fail(response, body, "DDI_UNAVAILABLE", "application");
    return body as { status: string; reason?: string; provider?: string; data?: { ownerId?: string; accountRef?: string; threads?: Array<{ id: string; channel: string; peerRef?: string; unreadCount?: number }> } };
  }
}

export async function issueAuthorityToken(sessionToken: string, grantId: string) {
  const base = digiCoreBaseUrl();
  if (!base) throw new InfrastructureError("DIGI_UNAVAILABLE", "Digi Core is not configured", 503);
  let response: Response;
  try {
    response = await fetch(new URL("/authority/token", base), {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
      body: JSON.stringify({ grantId }),
    });
  } catch {
    throw new InfrastructureError("AUTHORITY_UNAVAILABLE", "Digi Authority is unavailable", 503);
  }
  const body = await readBody(response);
  if (!response.ok || typeof body.token !== "string") {
    if (response.status >= 500) throw new InfrastructureError("AUTHORITY_UNAVAILABLE", "Digi Authority is unavailable", 503);
    if (response.status === 401) throw new InfrastructureError("DIGI_SESSION_EXPIRED", "The Digi session expired. Sign in again to continue with your PDI.", 401);
    return null;
  }
  return body.token;
}

export function projectConnection(status: string | null | undefined): "NOT_CONNECTED" | "REQUESTED" | "ACTIVE" | "REVOKED" {
  if (status === "ACTIVE" || status === "REQUESTED_CHANGE") return status === "REQUESTED_CHANGE" ? "REQUESTED" : "ACTIVE";
  if (status === "REQUESTED") return "REQUESTED";
  if (status === "REVOKED") return "REVOKED";
  return "NOT_CONNECTED";
}
