const API = import.meta.env.VITE_STAFF_API_URL ?? "http://localhost:8800";
const SESSION_KEY = "hos.staff.session";

export type StaffSessionState = {
  token: string;
  sessionId: string;
  tenantId: string;
  tenantSlug: string;
  staffId: string;
  displayName: string;
  role: string;
  expiresAt: string;
};

export function saveSession(state: StaffSessionState) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

export function getSession(): StaffSessionState | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as StaffSessionState;
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
  localStorage.removeItem(SESSION_KEY);
}

export async function login(tenantSlug: string, email: string, password: string) {
  const res = await fetch(`${API}/auth/staff/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tenantSlug, email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Login failed");
  }
  const state: StaffSessionState = {
    token: data.token,
    sessionId: data.session.sessionId,
    tenantId: data.tenantId,
    tenantSlug: data.tenantSlug,
    staffId: data.staff.id,
    displayName: data.staff.displayName,
    role: data.staff.role,
    expiresAt: data.session.expiresAt,
  };
  saveSession(state);
  return state;
}

export async function logout() {
  const session = getSession();
  try {
    await fetch(`${API}/auth/staff/logout`, {
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
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: session ? { Authorization: `Bearer ${session.token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const session = getSession();
  const res = await fetch(`${API}${path}`, {
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

export { API };
