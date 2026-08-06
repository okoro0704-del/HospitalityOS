import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

export function EventsBrowsePage() {
  const [events, setEvents] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      startsAt: string;
      status: string;
      venue: { name: string } | null;
      ticketTypes: Array<{ price: number }>;
    }>
  >([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load(query?: string) {
    const qs = query ? `?q=${encodeURIComponent(query)}` : "";
    apiGet<{ events: typeof events }>(`/guest/events${qs}`)
      .then((d) => setEvents(d.events))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="panel">
      <h2>Events</h2>
      <p className="muted">Browse ticketed events and venues.</p>
      {error && <p className="error">{error}</p>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          load(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" />
        <button type="submit" className="btn ghost">
          Search
        </button>
      </form>
      <Link className="btn ghost" to="/events/my-tickets">
        My tickets
      </Link>
      <Link className="btn ghost" to="/events/my-events" style={{ marginLeft: "0.5rem" }}>
        My events
      </Link>
      <div className="module-grid" style={{ marginTop: "1rem" }}>
        {events.map((ev) => (
          <article key={ev.id} className="module-tile">
            <h3>{ev.name}</h3>
            <p className="muted small">
              {new Date(ev.startsAt).toLocaleString()}
              {ev.venue ? ` · ${ev.venue.name}` : ""} · {ev.status}
            </p>
            {ev.description && <p>{ev.description}</p>}
            <Link className="btn" to={`/events/${ev.id}`}>
              Details
            </Link>
          </article>
        ))}
      </div>
      {events.length === 0 && <p className="muted">No events found.</p>}
    </section>
  );
}

export function EventDetailPage() {
  const { id = "" } = useParams();
  const [event, setEvent] = useState<{
    id: string;
    name: string;
    description: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    soldCount: number;
    seatingMode: string;
    venue: { name: string; location: string | null } | null;
    ticketTypes: Array<{ id: string; name: string; price: number; capacity: number; soldCount: number }>;
    sessions: Array<{ id: string; name: string; startsAt: string }>;
    packages: Array<{ id: string; name: string; price: number }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ event: NonNullable<typeof event> }>(`/guest/events/${id}`)
      .then((d) => setEvent(d.event))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [id]);

  if (!event && !error) return <section className="panel">Loading…</section>;

  return (
    <section className="panel">
      <Link to="/events">← Events</Link>
      {error && <p className="error">{error}</p>}
      {event && (
        <>
          <h2>{event.name}</h2>
          <p className="muted">
            {new Date(event.startsAt).toLocaleString()} – {new Date(event.endsAt).toLocaleString()}
          </p>
          {event.venue && (
            <p>
              Venue: {event.venue.name}
              {event.venue.location ? ` · ${event.venue.location}` : ""}
            </p>
          )}
          {event.description && <p>{event.description}</p>}
          <p>
            Capacity {event.soldCount}/{event.capacity} · {event.seatingMode.replace("_", " ")}
          </p>
          <Link className="btn" to={`/events/${event.id}/tickets`}>
            Get tickets
          </Link>
          {event.seatingMode === "assigned" && (
            <Link className="btn ghost" to={`/events/${event.id}/seating`} style={{ marginLeft: "0.5rem" }}>
              Seating
            </Link>
          )}
          {event.sessions.length > 0 && (
            <>
              <h3>Sessions</h3>
              <ul className="timeline">
                {event.sessions.map((s) => (
                  <li key={s.id}>
                    {s.name} · {new Date(s.startsAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </>
          )}
          {event.packages.length > 0 && (
            <>
              <h3>Packages</h3>
              <ul className="list">
                {event.packages.map((p) => (
                  <li key={p.id}>
                    {p.name} · {p.price.toFixed(2)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function EventTicketsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [types, setTypes] = useState<
    Array<{ id: string; name: string; price: number; remaining: number }>
  >([]);
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [seatId, setSeatId] = useState("");
  const [seats, setSeats] = useState<Array<{ id: string; label: string; available: boolean }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ticketTypes: typeof types }>(`/guest/events/${id}/tickets`).then((d) => {
      setTypes(d.ticketTypes);
      if (d.ticketTypes[0]) setTicketTypeId(d.ticketTypes[0].id);
    });
    apiGet<{
      plan: {
        sections: Array<{ seats: Array<{ id: string; label: string; available: boolean }> }>;
      } | null;
    }>(`/guest/events/${id}/seating`).then((d) => {
      const all = d.plan?.sections.flatMap((s) => s.seats) ?? [];
      setSeats(all.filter((s) => s.available));
    });
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/guest/tickets", "POST", {
        eventId: id,
        ticketTypeId,
        seatId: seatId || undefined,
        joinWaitlistIfUnavailable: true,
      });
      setMessage("Ticket booked");
      setError(null);
      navigate("/events/my-tickets");
    } catch (err) {
      const e2 = err as Error & { code?: string };
      if (e2.code === "waitlisted" || e2.message?.includes("waitlist")) {
        setMessage("Joined waitlist");
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed");
      }
    }
  }

  return (
    <section className="panel">
      <Link to={`/events/${id}`}>← Event</Link>
      <h2>Select tickets</h2>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <form className="stack" onSubmit={onSubmit}>
        <select value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)} required>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.price.toFixed(2)} · {t.remaining} left
            </option>
          ))}
        </select>
        {seats.length > 0 && (
          <select value={seatId} onChange={(e) => setSeatId(e.target.value)}>
            <option value="">Seat (if assigned)</option>
            {seats.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="btn">
          Book ticket
        </button>
      </form>
    </section>
  );
}

export function EventSeatingGuestPage() {
  const { id = "" } = useParams();
  const [plan, setPlan] = useState<{
    name: string;
    sections: Array<{
      name: string;
      seats: Array<{ id: string; label: string; available: boolean; status: string }>;
    }>;
  } | null>(null);

  useEffect(() => {
    apiGet<{ plan: typeof plan }>(`/guest/events/${id}/seating`).then((d) => setPlan(d.plan));
  }, [id]);

  return (
    <section className="panel">
      <Link to={`/events/${id}`}>← Event</Link>
      <h2>Seating</h2>
      {!plan && <p className="muted">General admission — no assigned seats.</p>}
      {plan && (
        <ul className="list">
          {plan.sections.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong>
              <ul>
                {s.seats.map((seat) => (
                  <li key={seat.id}>
                    {seat.label} · {seat.available ? "available" : seat.status}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <Link className="btn" to={`/events/${id}/tickets`}>
        Book with seat
      </Link>
    </section>
  );
}

export function MyTicketsPage() {
  const [tickets, setTickets] = useState<
    Array<{
      id: string;
      status: string;
      event: { name: string; startsAt: string };
      ticketType: { name: string };
      seat: { label: string } | null;
    }>
  >([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ tickets: typeof tickets }>("/guest/tickets");
    setTickets(d.tickets);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function cancel(id: string) {
    await apiSend(`/guest/tickets/${id}/cancel`, "POST", {});
    setMessage("Cancelled");
    await load();
  }

  return (
    <section className="panel">
      <h2>My tickets</h2>
      <Link to="/events">← Events</Link>
      {message && <p className="success">{message}</p>}
      <ul className="timeline">
        {tickets.map((t) => (
          <li key={t.id}>
            {t.event.name} · {t.ticketType.name} · {t.status}
            {t.seat ? ` · seat ${t.seat.label}` : ""} · {new Date(t.event.startsAt).toLocaleString()}
            {t.status === "confirmed" && (
              <button type="button" className="btn ghost" onClick={() => cancel(t.id)}>
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyEventsPage() {
  const [events, setEvents] = useState<Array<{ id: string; name: string; startsAt: string; status: string }>>(
    [],
  );
  useEffect(() => {
    apiGet<{ events: typeof events }>("/guest/events/mine").then((d) => setEvents(d.events));
  }, []);
  return (
    <section className="panel">
      <h2>My events</h2>
      <Link to="/events">← Events</Link>
      <ul className="list">
        {events.map((e) => (
          <li key={e.id}>
            <Link to={`/events/${e.id}`}>{e.name}</Link> · {new Date(e.startsAt).toLocaleString()} ·{" "}
            {e.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
