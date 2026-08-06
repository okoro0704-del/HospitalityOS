import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TenantPublic } from "@hospitalityos/shared";
import {
  enterDemoVenue,
  getApiBaseUrl,
  getSession,
  isApiMisconfigured,
} from "../lib/session";

export function TenantSelectPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState<string | null>(null);
  const apiBase = getApiBaseUrl();
  const misconfigured = isApiMisconfigured();

  useEffect(() => {
    if (getSession()) {
      navigate("/home", { replace: true });
      return;
    }

    if (misconfigured) {
      setError(
        "This deploy has no VITE_HOS_API_URL. Set it in Netlify to your live HospitalityOS API origin, then rebuild.",
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${apiBase}/platform/tenants`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            `Could not reach HospitalityOS API at ${apiBase} (${res.status}).`,
          );
        }
        return res.json() as Promise<{ tenants: TenantPublic[] }>;
      })
      .then((data) => setTenants(data.tenants))
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : `Could not load venues from ${apiBase}`,
        ),
      )
      .finally(() => setLoading(false));
  }, [apiBase, misconfigured, navigate]);

  async function onEnter(slug: string) {
    setEntering(slug);
    setError(null);
    try {
      await enterDemoVenue(slug);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enter venue");
    } finally {
      setEntering(null);
    }
  }

  return (
    <div className="auth-screen">
      <p className="brand">HospitalityOS</p>
      <h1>Choose a venue</h1>
      <p className="muted">
        Select a demo venue to open the guest experience hub. LifeOS handoff still works at{" "}
        <code>/auth/lifeos</code> when available.
      </p>
      <p className="muted small">
        API: <code>{apiBase}</code>
      </p>
      {loading && <p className="muted">Loading venues…</p>}
      {error && (
        <div className="error-panel">
          <p className="error">{error}</p>
          <p className="muted small">
            The guest app is static hosting only. It needs a reachable API: set{" "}
            <code>VITE_HOS_API_URL</code> for this build, and allow this site origin in the API’s{" "}
            <code>CORS_ORIGINS</code>. Keep <code>ALLOW_DEMO_GUEST=true</code> for demo entry.
          </p>
        </div>
      )}
      <ul className="tenant-list">
        {tenants.map((t) => (
          <li key={t.id} style={{ ["--accent" as string]: t.branding.primaryColor }}>
            <strong>{t.name}</strong>
            <span>{t.businessType.replaceAll("_", " ")}</span>
            <span className="muted small">
              {t.enabledModules.length} modules · {t.experienceId}
            </span>
            <button
              type="button"
              className="btn"
              disabled={entering === t.slug}
              onClick={() => onEnter(t.slug)}
            >
              {entering === t.slug ? "Entering…" : "Enter as guest"}
            </button>
          </li>
        ))}
      </ul>
      {!loading && !error && tenants.length === 0 && (
        <p className="muted">No active venues found. Seed the API database first.</p>
      )}
      <p className="muted small">
        <Link to="/">← Back</Link>
      </p>
    </div>
  );
}
