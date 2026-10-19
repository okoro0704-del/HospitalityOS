import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend, getSession } from "../lib/api";
import { canSeeNav } from "../lib/permissions";
import { BranchScopeBar, getSelectedBranchId } from "../components/BranchScope";

type OverviewPayload = {
  overview: {
    day: string;
    metrics: Array<{ id: string; label: string; value: number | string; derived: boolean; note?: string }>;
    disclaimer: string;
  };
};

export function OverviewPage() {
  const [data, setData] = useState<OverviewPayload["overview"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    const branchId = getSelectedBranchId();
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    apiGet<OverviewPayload>(`/operations/overview${qs}`)
      .then((d) => setData(d.overview))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }

  useEffect(() => {
    load();
    const onBranch = () => load();
    window.addEventListener("hos-branch-change", onBranch);
    return () => window.removeEventListener("hos-branch-change", onBranch);
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Business overview</h2>
          <p className="muted">Derived metrics from live transactional data — not a BI warehouse.</p>
        </div>
        <BranchScopeBar />
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="muted small">{data.day}</p>
          <div className="stat-row">
            {data.metrics.map((m) => (
              <article key={m.id} title={m.note}>
                <strong>{m.value}</strong>
                <span>{m.label}</span>
              </article>
            ))}
          </div>
          <p className="muted small">{data.disclaimer}</p>
        </>
      )}
      <p>
        <Link to="/">← Back to Today</Link>
      </p>
    </section>
  );
}

type SettingsHub = {
  sections: Array<{ id: string; title: string; href: string; permission: string }>;
  tenant: {
    id: string;
    name: string;
    slug: string;
    businessType: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    theme: string;
    email?: string | null;
    phone?: string | null;
  };
  branches: Array<{ id: string; name: string; code: string; status: string; isPrimary: boolean }>;
  modules: Array<{ moduleId: string; enabled: boolean }>;
};

export function SettingsHubPage() {
  const [hub, setHub] = useState<SettingsHub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState({ primaryColor: "", name: "" });
  const [saved, setSaved] = useState<string | null>(null);
  const session = getSession();

  useEffect(() => {
    apiGet<SettingsHub>("/staff/settings")
      .then((d) => {
        setHub(d);
        setBranding({ primaryColor: d.tenant.primaryColor, name: d.tenant.name });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    setSaved(null);
    try {
      await apiSend("/tenant/branding", "PATCH", {
        primaryColor: branding.primaryColor || undefined,
        name: branding.name || undefined,
      });
      setSaved("Branding saved (audited).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (!hub) {
    return (
      <section className="page">
        {error ? <p className="error">{error}</p> : <p className="muted">Loading settings…</p>}
      </section>
    );
  }

  const canManage = canSeeNav(session?.role, "settings.manage");

  return (
    <section className="page settings-hub">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>Settings</h2>
          <p className="muted">Central hub over existing configuration models — no duplicate storage.</p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="ok" role="status">
          {saved}
        </p>
      )}

      <div className="settings-grid">
        {hub.sections.map((s) => (
          <Link key={s.id} to={s.href} className="panel soft settings-card">
            <h3>{s.title}</h3>
            <p className="muted small">{s.permission}</p>
          </Link>
        ))}
      </div>

      <section className="panel soft" id="organization" aria-labelledby="org-h">
        <h3 id="org-h">Organization</h3>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{hub.tenant.name}</dd>
          </div>
          <div>
            <dt>Slug</dt>
            <dd>{hub.tenant.slug}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{hub.tenant.businessType}</dd>
          </div>
        </dl>
      </section>

      <section className="panel soft" id="branches" aria-labelledby="br-h">
        <h3 id="br-h">Branches</h3>
        <ul className="list">
          {hub.branches.map((b) => (
            <li key={b.id}>
              {b.name} ({b.code}) {b.isPrimary ? "· primary" : ""} · {b.status}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="panel soft" id="branding" aria-labelledby="bd-h">
          <h3 id="bd-h">Branding</h3>
          <form onSubmit={saveBranding} className="form-stack">
            <label>
              Display name
              <input
                className="input"
                value={branding.name}
                onChange={(e) => setBranding((b) => ({ ...b, name: e.target.value }))}
              />
            </label>
            <label>
              Primary color
              <input
                className="input"
                type="color"
                value={branding.primaryColor || "#0F766E"}
                onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
              />
            </label>
            <button type="submit" className="btn">
              Save branding
            </button>
          </form>
        </section>
      )}

      <section className="panel soft" id="modules" aria-labelledby="mod-h">
        <h3 id="mod-h">Modules</h3>
        <div className="chip-row">
          {hub.modules
            .filter((m) => m.enabled)
            .map((m) => (
              <span key={m.moduleId} className="chip">
                {m.moduleId}
              </span>
            ))}
        </div>
        {canSeeNav(session?.role, "modules.manage") && (
          <p>
            <Link to="/modules">Manage modules →</Link>
          </p>
        )}
      </section>

      <section className="panel soft" id="integrations" aria-labelledby="int-h">
        <h3 id="int-h">Integrations</h3>
        <p className="muted">
          LifeOS experience handoff, mock payment providers, and mock communications are configured via
          environment and module settings. Business Portal and TrustID are out of scope here.
        </p>
      </section>

      <section className="panel soft" id="security" aria-labelledby="sec-h">
        <h3 id="sec-h">Security</h3>
        <p className="muted">
          Sessions, RBAC, tenant/branch isolation, and webhook signatures are enforced by the API. See
          Security Model docs.
        </p>
      </section>

      {canSeeNav(session?.role, "audit.read") && (
        <section className="panel soft" id="audit" aria-labelledby="aud-h">
          <h3 id="aud-h">Audit</h3>
          <AuditSnippet />
        </section>
      )}
    </section>
  );
}

function AuditSnippet() {
  const [logs, setLogs] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  useEffect(() => {
    apiGet<{ logs: typeof logs }>("/staff/settings/audit")
      .then((d) => setLogs(d.logs.slice(0, 20)))
      .catch(() => undefined);
  }, []);
  return (
    <ul className="list">
      {logs.map((l) => (
        <li key={l.id}>
          {l.action} · {new Date(l.createdAt).toLocaleString()}
        </li>
      ))}
      {logs.length === 0 && <li className="muted">No recent audit events.</li>}
    </ul>
  );
}

/** @deprecated use SettingsHubPage */
export function SettingsPage() {
  return <SettingsHubPage />;
}
