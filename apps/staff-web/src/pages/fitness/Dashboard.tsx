import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function FitnessDashboardPage() {
  const [data, setData] = useState<{
    members: number;
    activeMemberships: number;
    upcomingSessions: number;
    checkInsToday: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/fitness/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Fitness dashboard</h2>
          <p className="muted">Members, memberships, classes, and check-ins at a glance.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="stat-row">
          <article className="stat">
            <p className="muted">Members</p>
            <strong>{data.members}</strong>
          </article>
          <article className="stat">
            <p className="muted">Active memberships</p>
            <strong>{data.activeMemberships}</strong>
          </article>
          <article className="stat">
            <p className="muted">Upcoming sessions</p>
            <strong>{data.upcomingSessions}</strong>
          </article>
          <article className="stat">
            <p className="muted">Check-ins (24h)</p>
            <strong>{data.checkInsToday}</strong>
          </article>
        </div>
      )}
    </section>
  );
}

export function FitnessFacilitiesPage() {
  const [facilities, setFacilities] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      areas: Array<{ id: string; name: string; areaType: string; capacity: number | null }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ facilities: typeof facilities }>("/fitness/facilities");
    setFacilities(d.facilities);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreateFacility(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/fitness/facilities", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        description: fd.get("description") || undefined,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onCreateArea(e: FormEvent, facilityId: string) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend(`/fitness/facilities/${facilityId}/areas`, "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        areaType: fd.get("areaType") || "gym_floor",
        capacity: fd.get("capacity") ? Number(fd.get("capacity")) : undefined,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Facilities & areas</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreateFacility}>
        <h3>New facility</h3>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="description" placeholder="Description" />
        <button type="submit" className="btn">
          Create facility
        </button>
      </form>
      <ul className="list">
        {facilities.map((f) => (
          <li key={f.id}>
            <strong>
              {f.name} ({f.code})
            </strong>
            <ul>
              {f.areas.map((a) => (
                <li key={a.id}>
                  {a.name} · {a.areaType}
                  {a.capacity != null ? ` · cap ${a.capacity}` : ""}
                </li>
              ))}
            </ul>
            <form className="stack" onSubmit={(e) => onCreateArea(e, f.id)}>
              <input name="name" placeholder="Area name" required />
              <input name="code" placeholder="Code" required />
              <select name="areaType" defaultValue="gym_floor">
                <option value="gym_floor">Gym floor</option>
                <option value="cardio">Cardio</option>
                <option value="weights">Weights</option>
                <option value="studio">Studio</option>
                <option value="pool">Pool</option>
                <option value="boxing">Boxing</option>
                <option value="sauna">Sauna</option>
                <option value="outdoor">Outdoor</option>
              </select>
              <input name="capacity" type="number" placeholder="Capacity" />
              <button type="submit" className="btn ghost">
                Add area
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
