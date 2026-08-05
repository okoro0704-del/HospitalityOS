import { useEffect, useState } from "react";
import { apiGet, apiSend } from "../lib/api";

type ModuleRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
};

export function ModulesPage() {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ modules: ModuleRow[] }>("/tenant/modules");
    setModules(data.modules);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function toggle(moduleId: string, enabled: boolean) {
    setBusy(moduleId);
    setError(null);
    try {
      await apiSend(`/tenant/modules/${moduleId}`, "PUT", { enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>Module registry</h2>
          <p className="muted">
            Enable only the capabilities this business needs. New modules register in the
            shared catalog without redesigning the platform.
          </p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="module-table">
        {modules.map((m) => (
          <div key={m.id} className="module-row">
            <div>
              <strong>{m.name}</strong>
              <p className="muted small">{m.description}</p>
              <span className="chip quiet">{m.category}</span>
            </div>
            <button
              type="button"
              className={m.enabled ? "btn" : "btn ghost"}
              disabled={busy === m.id}
              onClick={() => toggle(m.id, !m.enabled)}
            >
              {busy === m.id ? "…" : m.enabled ? "Enabled" : "Enable"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
