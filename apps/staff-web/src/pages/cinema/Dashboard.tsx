import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function CinemaDashboardPage() {
  const [data, setData] = useState<{
    onSale: number;
    screens: number;
    ticketsToday: number;
    activeHolds: number;
    openOrders: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/cinema/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Cinema & Entertainment</p>
          <h2>Cinema dashboard</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="stat-row">
          <article className="stat">
            <p className="muted">On sale</p>
            <strong>{data.onSale}</strong>
          </article>
          <article className="stat">
            <p className="muted">Screens</p>
            <strong>{data.screens}</strong>
          </article>
          <article className="stat">
            <p className="muted">Tickets (24h)</p>
            <strong>{data.ticketsToday}</strong>
          </article>
          <article className="stat">
            <p className="muted">Active holds</p>
            <strong>{data.activeHolds}</strong>
          </article>
          <article className="stat">
            <p className="muted">Open orders</p>
            <strong>{data.openOrders}</strong>
          </article>
        </div>
      )}
    </section>
  );
}

export function CinemaVenuesPage() {
  const [venues, setVenues] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      screens: Array<{ id: string; name: string; capacity: number; screenType: string }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ venues: typeof venues }>("/cinema/venues");
    setVenues(d.venues);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onVenue(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/cinema/venues", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        location: fd.get("location") || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function onScreen(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/cinema/screens", "POST", {
        venueId: fd.get("venueId"),
        name: fd.get("name"),
        code: fd.get("code"),
        screenType: fd.get("screenType") || "standard",
        capacity: Number(fd.get("capacity") || 100),
        seatingMode: fd.get("seatingMode") || "assigned",
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
        <h2>Venues & screens</h2>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onVenue}>
        <h3>New venue</h3>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="location" placeholder="Location" />
        <button type="submit">Create venue</button>
      </form>
      <form className="card-form" onSubmit={onScreen}>
        <h3>New screen</h3>
        <select name="venueId" required>
          <option value="">Venue</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Screen name" required />
        <input name="code" placeholder="Code" required />
        <input name="capacity" type="number" placeholder="Capacity" defaultValue={100} />
        <select name="screenType" defaultValue="standard">
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="imax">IMAX</option>
          <option value="vip">VIP</option>
        </select>
        <select name="seatingMode" defaultValue="assigned">
          <option value="assigned">Assigned</option>
          <option value="general_admission">General admission</option>
        </select>
        <button type="submit">Create screen</button>
      </form>
      <ul className="list">
        {venues.map((v) => (
          <li key={v.id}>
            <strong>{v.name}</strong> ({v.code})
            <ul>
              {v.screens.map((s) => (
                <li key={s.id}>
                  {s.name} · {s.screenType} · {s.capacity} seats
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
