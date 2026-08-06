import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function EventsDashboardPage() {
  const [data, setData] = useState<{
    openEvents: number;
    venues: number;
    ticketsToday: number;
    waitlist: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/events/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Events dashboard</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="stat-row">
          <article className="stat">
            <p className="muted">Open events</p>
            <strong>{data.openEvents}</strong>
          </article>
          <article className="stat">
            <p className="muted">Venues</p>
            <strong>{data.venues}</strong>
          </article>
          <article className="stat">
            <p className="muted">Tickets (24h)</p>
            <strong>{data.ticketsToday}</strong>
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

export function EventsVenuesPage() {
  const [venues, setVenues] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      capacity: number;
      bookableResourceId: string | null;
      areas: Array<{ id: string; name: string; capacity: number }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ venues: typeof venues }>("/venues");
    setVenues(d.venues);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onVenue(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/venues", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        capacity: Number(fd.get("capacity") || 100),
        venueType: fd.get("venueType") || "ballroom",
        location: fd.get("location") || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function onArea(e: FormEvent, venueId: string) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend(`/venues/${venueId}/areas`, "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        capacity: Number(fd.get("capacity") || 50),
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
          <p className="eyebrow">Events & Venues</p>
          <h2>Venues</h2>
          <p className="muted">Reservable venues sync to the Booking Engine.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onVenue}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="capacity" type="number" defaultValue={100} />
        <input name="location" placeholder="Location" />
        <select name="venueType" defaultValue="ballroom">
          <option value="ballroom">Ballroom</option>
          <option value="conference_hall">Conference hall</option>
          <option value="wedding_hall">Wedding hall</option>
          <option value="auditorium">Auditorium</option>
          <option value="outdoor">Outdoor</option>
          <option value="meeting_room">Meeting room</option>
        </select>
        <button type="submit" className="btn">
          Create venue
        </button>
      </form>
      <ul className="list">
        {venues.map((v) => (
          <li key={v.id}>
            <strong>{v.name}</strong> · cap {v.capacity}
            {v.bookableResourceId ? <span className="muted small"> · bookable</span> : null}
            <ul>
              {v.areas.map((a) => (
                <li key={a.id}>
                  {a.name} · {a.capacity}
                </li>
              ))}
            </ul>
            <form className="stack" onSubmit={(e) => onArea(e, v.id)}>
              <input name="name" placeholder="Area name" required />
              <input name="code" placeholder="Code" required />
              <input name="capacity" type="number" defaultValue={50} />
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
