import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function SpaDashboardPage() {
  const [data, setData] = useState<{
    appointmentsToday: number;
    therapists: number;
    rooms: number;
    waitlist: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/spa/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Spa dashboard</h2>
          <p className="muted">Appointments, therapists, rooms, and waitlist.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="stat-row">
          <article className="stat">
            <p className="muted">Today's appointments</p>
            <strong>{data.appointmentsToday}</strong>
          </article>
          <article className="stat">
            <p className="muted">Therapists</p>
            <strong>{data.therapists}</strong>
          </article>
          <article className="stat">
            <p className="muted">Rooms</p>
            <strong>{data.rooms}</strong>
          </article>
          <article className="stat">
            <p className="muted">Waitlist</p>
            <strong>{data.waitlist}</strong>
          </article>
        </div>
      )}
    </section>
  );
}

export function SpaFacilitiesPage() {
  const [facilities, setFacilities] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      rooms: Array<{ id: string; name: string; roomType: string; status: string }>;
      areas: Array<{ id: string; name: string; areaType: string }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ facilities: typeof facilities }>("/spa/facilities");
    setFacilities(d.facilities);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onFacility(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/spa/facilities", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        description: fd.get("description") || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onRoom(e: FormEvent, facilityId: string) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend(`/spa/facilities/${facilityId}/rooms`, "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        roomType: fd.get("roomType") || "massage",
        capacity: Number(fd.get("capacity") || 1),
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Facilities & rooms</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onFacility}>
        <input name="name" placeholder="Facility name" required />
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
              {f.rooms.map((r) => (
                <li key={r.id}>
                  {r.name} · {r.roomType} · {r.status}
                </li>
              ))}
              {f.areas.map((a) => (
                <li key={a.id}>
                  {a.name} · {a.areaType}
                </li>
              ))}
            </ul>
            <form className="stack" onSubmit={(e) => onRoom(e, f.id)}>
              <input name="name" placeholder="Room name" required />
              <input name="code" placeholder="Code" required />
              <select name="roomType" defaultValue="massage">
                <option value="massage">Massage</option>
                <option value="facial">Facial</option>
                <option value="couples">Couples</option>
                <option value="vip">VIP</option>
                <option value="consultation">Consultation</option>
              </select>
              <input name="capacity" type="number" defaultValue={1} />
              <button type="submit" className="btn ghost">
                Add room
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
