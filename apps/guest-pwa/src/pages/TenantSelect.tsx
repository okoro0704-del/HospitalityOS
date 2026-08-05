import { useEffect, useState } from "react";
import type { TenantPublic } from "@hospitalityos/shared";

const API = import.meta.env.VITE_HOS_API_URL ?? "http://localhost:8800";

export function TenantSelectPage() {
  const [tenants, setTenants] = useState<TenantPublic[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/platform/tenants`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load venues");
        return res.json() as Promise<{ tenants: TenantPublic[] }>;
      })
      .then((data) => setTenants(data.tenants))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  return (
    <div className="auth-screen">
      <p className="brand">HospitalityOS</p>
      <h1>Choose a venue</h1>
      <p className="muted">
        Guest access is granted through LifeOS. Open an experience from LifeOS, or browse
        demo venues below.
      </p>
      {error && <p className="error">{error}</p>}
      <ul className="tenant-list">
        {tenants.map((t) => (
          <li key={t.id} style={{ ["--accent" as string]: t.branding.primaryColor }}>
            <strong>{t.name}</strong>
            <span>{t.businessType.replaceAll("_", " ")}</span>
            <span className="muted small">
              {t.enabledModules.length} modules · experience {t.experienceId}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Launch URL pattern:{" "}
        <code>/auth/lifeos?handoff=…&amp;experience_id=…</code>
      </p>
    </div>
  );
}
