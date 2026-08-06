import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

export function CinemaBrowsePage() {
  const [data, setData] = useState<{
    content: Array<{ id: string; title: string; genre: string | null; rating: string; runtimeMinutes: number }>;
    showtimes: Array<{
      id: string;
      startsAt: string;
      status: string;
      content: { id: string; title: string };
      screen: { name: string };
    }>;
    venues: Array<{ id: string; name: string }>;
  } | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/guest/cinema")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.content.filter(
      (c) => !term || c.title.toLowerCase().includes(term) || (c.genre ?? "").toLowerCase().includes(term),
    );
  }, [data, q]);
  return (
    <section className="page">
      <h2>Cinema</h2>
      <p className="muted">Browse movies and showtimes.</p>
      {error && <p className="error">{error}</p>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies" />
      <Link className="btn ghost" to="/cinema/my-tickets">
        My tickets
      </Link>
      <ul className="list">
        {filtered.map((c) => (
          <li key={c.id}>
            <strong>{c.title}</strong> · {c.rating} · {c.runtimeMinutes}m · {c.genre ?? "—"}
            <div>
              <Link className="btn" to={`/cinema/${c.id}`}>
                Details
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {data && (
        <>
          <h3>Upcoming showtimes</h3>
          <ul className="list">
            {data.showtimes.map((s) => (
              <li key={s.id}>
                {s.content.title} · {s.screen.name} · {new Date(s.startsAt).toLocaleString()} · {s.status}
                <Link className="btn ghost" to={`/cinema/${s.content.id}/showtimes`}>
                  Book
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function CinemaDetailPage() {
  const { id } = useParams();
  const [content, setContent] = useState<{
    id: string;
    title: string;
    description: string | null;
    rating: string;
    runtimeMinutes: number;
    genre: string | null;
    showtimes: Array<{
      id: string;
      startsAt: string;
      status: string;
      screen: { name: string };
      ticketTypes: Array<{ id: string; name: string; price: number }>;
    }>;
  } | null>(null);
  useEffect(() => {
    if (!id) return;
    apiGet<{ content: NonNullable<typeof content> }>(`/guest/cinema/content/${id}`).then((d) =>
      setContent(d.content),
    );
  }, [id]);
  if (!content) return <p className="muted">Loading…</p>;
  return (
    <section className="page">
      <Link to="/cinema">← Cinema</Link>
      <h2>{content.title}</h2>
      <p className="muted">
        {content.rating} · {content.runtimeMinutes}m · {content.genre ?? "—"}
      </p>
      <p>{content.description}</p>
      <Link className="btn" to={`/cinema/${content.id}/showtimes`}>
        Showtimes & tickets
      </Link>
      <ul className="list">
        {content.showtimes.map((s) => (
          <li key={s.id}>
            {s.screen.name} · {new Date(s.startsAt).toLocaleString()} · {s.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CinemaShowtimesGuestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState<{
    id: string;
    title: string;
    showtimes: Array<{
      id: string;
      startsAt: string;
      seatingMode: string;
      status: string;
      screen: { name: string };
      ticketTypes: Array<{ id: string; name: string; price: number; capacity: number; soldCount: number }>;
    }>;
  } | null>(null);
  const [showtimeId, setShowtimeId] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [seatId, setSeatId] = useState("");
  const [seats, setSeats] = useState<
    Array<{ id: string; label: string; status: string }>
  >([]);
  const [sessionKey] = useState(() => `guest-${Math.random().toString(36).slice(2)}`);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<{ content: NonNullable<typeof content> }>(`/guest/cinema/content/${id}`).then((d) => {
      setContent(d.content);
      if (d.content.showtimes[0]) setShowtimeId(d.content.showtimes[0].id);
    });
  }, [id]);

  useEffect(() => {
    if (!showtimeId) return;
    apiGet<{ seatMap: { sections: Array<{ seats: Array<{ id: string; label: string; status: string }> }> } | null }>(
      `/guest/cinema/showtimes/${showtimeId}/seats`,
    ).then((d) => {
      const all = d.seatMap?.sections.flatMap((s) => s.seats) ?? [];
      setSeats(all);
    });
    const st = content?.showtimes.find((s) => s.id === showtimeId);
    if (st?.ticketTypes[0]) setTicketTypeId(st.ticketTypes[0].id);
  }, [showtimeId, content]);

  const selected = content?.showtimes.find((s) => s.id === showtimeId);

  async function hold() {
    if (!seatId) return;
    try {
      await apiSend("/guest/cinema/holds", "POST", { showtimeId, seatId, sessionKey });
      setMsg("Seat held — complete booking soon");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hold failed");
    }
  }

  async function book() {
    setError(null);
    try {
      await apiSend("/guest/cinema/tickets", "POST", {
        showtimeId,
        ticketTypeId,
        seatId: seatId || undefined,
        sessionKey,
        joinWaitlistIfUnavailable: true,
      });
      navigate("/cinema/my-tickets");
    } catch (e) {
      const err = e as Error & { body?: { error?: string } };
      setError(err.message);
      setMsg(err.body?.error === "waitlisted" ? "Added to waitlist" : null);
    }
  }

  if (!content) return <p className="muted">Loading…</p>;
  return (
    <section className="page">
      <Link to={`/cinema/${id}`}>← {content.title}</Link>
      <h2>Select showtime</h2>
      {error && <p className="error">{error}</p>}
      {msg && <p className="muted">{msg}</p>}
      <select value={showtimeId} onChange={(e) => setShowtimeId(e.target.value)}>
        {content.showtimes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.screen.name} · {new Date(s.startsAt).toLocaleString()} · {s.status}
          </option>
        ))}
      </select>
      {selected && (
        <>
          <h3>Ticket type</h3>
          <select value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)}>
            {selected.ticketTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · ${t.price} · {t.soldCount}/{t.capacity}
              </option>
            ))}
          </select>
          {selected.seatingMode === "assigned" && (
            <>
              <h3>Seat</h3>
              <select value={seatId} onChange={(e) => setSeatId(e.target.value)}>
                <option value="">Select seat</option>
                {seats
                  .filter((s) => s.status === "available" || s.status === "held")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.status})
                    </option>
                  ))}
              </select>
              <button type="button" className="btn ghost" onClick={hold} disabled={!seatId}>
                Hold seat
              </button>
              <Link className="btn ghost" to={`/cinema/${id}/seats?showtimeId=${showtimeId}`}>
                Seat map
              </Link>
            </>
          )}
          <button type="button" className="btn" onClick={book} disabled={!ticketTypeId}>
            Book ticket
          </button>
        </>
      )}
    </section>
  );
}

export function CinemaSeatsGuestPage() {
  const { id } = useParams();
  const showtimeId = new URLSearchParams(location.search).get("showtimeId") ?? "";
  const [seatMap, setSeatMap] = useState<{
    sections: Array<{ name: string; seats: Array<{ id: string; label: string; status: string }> }>;
  } | null>(null);
  useEffect(() => {
    if (!showtimeId) return;
    apiGet<{ seatMap: typeof seatMap }>(`/guest/cinema/showtimes/${showtimeId}/seats`).then((d) =>
      setSeatMap(d.seatMap),
    );
  }, [showtimeId]);
  return (
    <section className="page">
      <Link to={`/cinema/${id}/showtimes`}>← Showtimes</Link>
      <h2>Seating</h2>
      {!showtimeId && <p className="muted">Select a showtime first.</p>}
      {seatMap?.sections.map((sec) => (
        <div key={sec.name}>
          <h3>{sec.name}</h3>
          <div className="muted">{sec.seats.map((s) => `${s.label}:${s.status}`).join(" · ")}</div>
        </div>
      ))}
    </section>
  );
}

export function CinemaMyTicketsPage() {
  const [tickets, setTickets] = useState<
    Array<{
      id: string;
      status: string;
      seat: { label: string } | null;
      showtime: { startsAt: string; content: { title: string }; screen: { name: string } };
      ticketType: { name: string };
    }>
  >([]);
  useEffect(() => {
    apiGet<{ tickets: typeof tickets }>("/guest/cinema/tickets").then((d) => setTickets(d.tickets));
  }, []);
  async function cancel(id: string) {
    await apiSend(`/guest/cinema/tickets/${id}/cancel`, "POST", {});
    const d = await apiGet<{ tickets: typeof tickets }>("/guest/cinema/tickets");
    setTickets(d.tickets);
  }
  return (
    <section className="page">
      <Link to="/cinema">← Cinema</Link>
      <h2>My tickets</h2>
      <ul className="list">
        {tickets.map((t) => (
          <li key={t.id}>
            <strong>{t.showtime.content.title}</strong> · {t.showtime.screen.name} ·{" "}
            {new Date(t.showtime.startsAt).toLocaleString()} · {t.ticketType.name} ·{" "}
            {t.seat?.label ?? "GA"} · {t.status}
            {t.status === "confirmed" && (
              <button type="button" className="btn ghost" onClick={() => cancel(t.id)}>
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
      {tickets.length === 0 && <p className="muted">No tickets yet.</p>}
    </section>
  );
}
