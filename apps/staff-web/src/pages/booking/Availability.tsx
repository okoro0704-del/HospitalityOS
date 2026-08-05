import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Resource = { id: string; name: string };
type Result = { available?: boolean; message?: string; error?: string };

export function BookingAvailabilityPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ resources: Resource[] }>("/booking/resources").then((d) => {
      setResources(d.resources);
      if (d.resources[0]) setResourceId(d.resources[0].id);
    });
  }, []);

  async function onCheck(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const q = new URLSearchParams({
        resourceId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      const data = await apiGet<Result>(`/booking/availability?${q}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function addBlackout(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/booking/blackouts", "POST", {
        name: "Maintenance window",
        resourceId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      setResult({ available: false, message: "Blackout created" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Booking engine</p>
          <h2>Availability</h2>
          <p className="muted">Central conflict, capacity, blackout, and holiday checks.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCheck}>
        <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        <button className="btn" type="submit">
          Check availability
        </button>
        <button className="btn ghost" type="button" onClick={addBlackout}>
          Add blackout
        </button>
      </form>
      {result && (
        <div className="panel soft">
          {result.available ? (
            <p className="ok">Available</p>
          ) : (
            <p className="error">{result.message ?? result.error ?? "Unavailable"}</p>
          )}
        </div>
      )}
    </section>
  );
}
