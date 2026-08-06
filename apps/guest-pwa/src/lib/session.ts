/** Resolve API base URL for browser builds. */
export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_HOS_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:8800";
}

/** True when a production host is using the localhost API fallback (misconfigured deploy). */
export function isApiMisconfigured(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  return !import.meta.env.VITE_HOS_API_URL?.trim();
}

const SESSION_KEY = "hos.guest.session";

export type GuestSessionState = {
  token: string;
  sessionId: string;
  tenantId: string;
  tenantSlug: string;
  customerId: string;
  displayName: string;
  experienceId: string;
  scopes: string[];
  expiresAt: string;
};

function apiUrl() {
  return getApiBaseUrl();
}

export async function exchangeHandoff(handoff: string, experienceId: string) {
  const res = await fetch(`${apiUrl()}/auth/guest/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ handoff, experienceId }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || "Exchange failed");
    (err as Error & { code: string }).code = data.error || "invalid_token";
    throw err;
  }
  return data as {
    token: string;
    session: {
      sessionId: string;
      tenantId: string;
      customerId: string;
      displayName: string;
      experienceId: string;
      scopes: string[];
      expiresAt: string;
    };
    customer: { id: string; displayName: string };
    tenantId: string;
    tenantSlug: string;
  };
}

/** Enter a demo venue without LifeOS (HospitalityOS-local session). */
export async function enterDemoVenue(tenantSlug: string, displayName = "Demo Guest") {
  const res = await fetch(`${apiUrl()}/auth/guest/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tenantSlug, displayName }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Could not enter venue (${res.status})`);
  }
  const result = data as {
    token: string;
    session: {
      sessionId: string;
      tenantId: string;
      customerId: string;
      displayName: string;
      experienceId: string;
      scopes: string[];
      expiresAt: string;
    };
    customer: { id: string; displayName: string };
    tenantId: string;
    tenantSlug: string;
  };
  saveSession({
    token: result.token,
    sessionId: result.session.sessionId,
    tenantId: result.tenantId,
    tenantSlug: result.tenantSlug,
    customerId: result.customer.id,
    displayName: result.session.displayName,
    experienceId: result.session.experienceId,
    scopes: result.session.scopes,
    expiresAt: result.session.expiresAt,
  });
  return result;
}

export function saveSession(state: GuestSessionState) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

export function getSession(): GuestSessionState | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as GuestSessionState;
    if (new Date(session.expiresAt) < new Date()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function logout() {
  const session = getSession();
  try {
    await fetch(`${apiUrl()}/auth/guest/logout`, {
      method: "POST",
      credentials: "include",
      headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    });
  } finally {
    clearSession();
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const session = getSession();
  const res = await fetch(`${apiUrl()}${path}`, {
    credentials: "include",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const session = getSession();
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Query params must never authenticate. */
export function rejectQueryAuth() {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("user") || params.get("trustId") || params.get("permissions"));
}
