import { useEffect, useState } from "react";
import { apiGet, apiSend } from "../lib/session";

type PdiView = {
  digi: "READY" | "UNAVAILABLE" | "EXPIRED";
  infrastructure: "NOT_PROVISIONED" | "ACTIVE" | "UNAVAILABLE";
  connection: "NOT_CONNECTED" | "REQUESTED" | "ACTIVE" | "REVOKED";
  message: string;
  execution?: { status: string; reason?: string };
};

export function PdiPanel() {
  const [view, setView] = useState<PdiView | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    const next = await apiGet<PdiView>("/guest/pdi");
    setView(next);
    if (next.connection === "ACTIVE") {
      const executed = await apiSend<PdiView>("/guest/pdi/execute", "POST", { executionMode: "APP" });
      setView(executed);
    }
  }

  useEffect(() => {
    load().catch(() => setNotice("Digiconomy infrastructure is unavailable."));
  }, []);

  async function run(path: string) {
    setBusy(true);
    setNotice("");
    try {
      const next = await apiSend<PdiView>(path, "POST", {});
      setView(next);
      if (next.connection === "ACTIVE" && path.endsWith("/approve")) {
        const executed = await apiSend<PdiView>("/guest/pdi/execute", "POST", { executionMode: "APP" });
        setView(executed);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Digiconomy infrastructure is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const infrastructureDown = !view || view.digi !== "READY" || view.infrastructure === "UNAVAILABLE";

  return (
    <section className="pdi-panel">
      <p className="eyebrow">Digiconomy infrastructure</p>
      {infrastructureDown && (
        <p className="muted">{view?.message ?? (notice || "Digiconomy infrastructure is unavailable.")}</p>
      )}
      {view?.infrastructure === "NOT_PROVISIONED" && view.digi === "READY" && (
        <>
          <p>Your Personal Digital Infrastructure has not been created.</p>
          <button type="button" className="btn" disabled={busy} onClick={() => run("/guest/pdi")}>
            Create my PDI
          </button>
        </>
      )}
      {view?.infrastructure === "ACTIVE" && view.connection === "NOT_CONNECTED" && (
        <>
          <p className="muted">Not connected</p>
          <button type="button" className="btn" disabled={busy} onClick={() => run("/guest/pdi/connect")}>
            Connect to my PDI
          </button>
        </>
      )}
      {view?.connection === "REQUESTED" && (
        <>
          <p>HospitalityOS wants permission to:</p>
          <p>Allow HospitalityOS to know which Digi Owner is currently using this product.</p>
          <ul className="list">
            <li>Identify your current Digi Owner</li>
          </ul>
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={() => run("/guest/pdi/approve")}>
              Approve
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setNotice("Connection left waiting for your approval.")}>
              Cancel
            </button>
          </div>
        </>
      )}
      {view?.connection === "ACTIVE" && (
        <>
          <p>PDI Connected</p>
          <p>HospitalityOS can use:</p>
          <ul className="list">
            <li>Current Actor</li>
          </ul>
          {view.execution && view.execution.status !== "COMPLETED" && (
            <p className="error">{view.execution.reason ?? view.message}</p>
          )}
        </>
      )}
      {view?.connection === "REVOKED" && (
        <>
          <p>PDI Access Revoked</p>
          <button type="button" className="btn" disabled={busy} onClick={() => run("/guest/pdi/connect")}>
            Reconnect
          </button>
        </>
      )}
      {notice && <p className="error">{notice}</p>}
    </section>
  );
}
