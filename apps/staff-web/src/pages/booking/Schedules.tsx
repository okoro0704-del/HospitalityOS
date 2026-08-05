import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Schedule = { id: string; name: string; kind: string; status: string };
type Resource = { id: string; name: string };

export function BookingSchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("weekly");
  const [resourceId, setResourceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [s, r] = await Promise.all([
      apiGet<{ schedules: Schedule[] }>("/booking/schedules"),
      apiGet<{ resources: Resource[] }>("/booking/resources"),
    ]);
    setSchedules(s.schedules);
    setResources(r.resources);
    if (r.resources[0]) setResourceId(r.resources[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/booking/schedules", "POST", {
        name,
        kind,
        resourceId: resourceId || undefined,
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: "09:00",
        endTime: "17:00",
      });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Booking engine</p>
          <h2>Schedules</h2>
          <p className="muted">One-time, daily, weekly, monthly, and seasonal schedules.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={onCreate}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="one_time">One-time</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="seasonal">Seasonal</option>
          <option value="recurring">Recurring</option>
        </select>
        <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
          <option value="">All resources</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add schedule
        </button>
      </form>
      <div className="table">
        <div className="table-head">
          <span>Name</span>
          <span>Kind</span>
          <span>Status</span>
        </div>
        {schedules.map((s) => (
          <div key={s.id} className="table-row">
            <span>{s.name}</span>
            <span>{s.kind}</span>
            <span>{s.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
