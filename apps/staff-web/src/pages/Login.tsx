import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { TenantPublic } from "@hospitalityos/shared";
import { API, getSession, login } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantPublic[]>([]);
  const [tenantSlug, setTenantSlug] = useState("sunrise-hotel");
  const [email, setEmail] = useState("front@sunrise.hotel");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getSession()) navigate("/", { replace: true });
    fetch(`${API}/public/demo/venues`)
      .then((r) => r.json())
      .then((data: { venues: Array<{ slug: string; name: string }> }) => {
        setTenants(
          data.venues.map((v) => ({
            id: v.slug,
            slug: v.slug,
            name: v.name,
            businessType: "hotel",
            status: "active" as const,
            branding: {
              primaryColor: "#0F766E",
              secondaryColor: "#134E4A",
              accentColor: "#F59E0B",
              theme: "light" as const,
            },
            contact: {},
            operatingHours: [],
            enabledModules: [],
          })),
        );
      })
      .catch(() => undefined);
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(tenantSlug, email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-panel">
        <p className="brand">HospitalityOS</p>
        <h1>Staff Web</h1>
        <p className="muted">
          Preferred sign-in is TrustID. Password login below is{" "}
          <strong>legacy / development authentication</strong> and cannot bypass
          tenant roles or permissions.
        </p>
        <form onSubmit={onSubmit} className="login-form">
          <label>
            Venue
            <select value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)}>
              {tenants.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted small">
          Demo password for seeded staff: password123 · Prefer TrustID when linked
        </p>
      </div>
    </div>
  );
}
