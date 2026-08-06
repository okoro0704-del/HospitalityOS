import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function CinemaContentPage() {
  const [content, setContent] = useState<
    Array<{ id: string; title: string; code: string; rating: string; runtimeMinutes: number; genre: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ content: typeof content }>("/cinema/content");
    setContent(d.content);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/cinema/content", "POST", {
        title: fd.get("title"),
        code: fd.get("code"),
        runtimeMinutes: Number(fd.get("runtimeMinutes") || 120),
        genre: fd.get("genre") || undefined,
        rating: fd.get("rating") || "PG",
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Content</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <input name="title" placeholder="Title" required />
        <input name="code" placeholder="Code" required />
        <input name="runtimeMinutes" type="number" placeholder="Runtime" defaultValue={120} />
        <input name="genre" placeholder="Genre" />
        <input name="rating" placeholder="Rating" defaultValue="PG" />
        <button type="submit">Add content</button>
      </form>
      <ul className="list">
        {content.map((c) => (
          <li key={c.id}>
            <strong>{c.title}</strong> · {c.rating} · {c.runtimeMinutes}m · {c.genre ?? "—"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CinemaShowtimesPage() {
  const [showtimes, setShowtimes] = useState<
    Array<{
      id: string;
      status: string;
      startsAt: string;
      capacity: number;
      soldCount: number;
      content: { title: string };
      screen: { name: string };
      ticketTypes: Array<{ id: string; name: string; price: number }>;
    }>
  >([]);
  const [content, setContent] = useState<Array<{ id: string; title: string }>>([]);
  const [screens, setScreens] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [st, c, s] = await Promise.all([
      apiGet<{ showtimes: typeof showtimes }>("/cinema/showtimes"),
      apiGet<{ content: typeof content }>("/cinema/content"),
      apiGet<{ screens: typeof screens }>("/cinema/screens"),
    ]);
    setShowtimes(st.showtimes);
    setContent(c.content);
    setScreens(s.screens);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/cinema/showtimes", "POST", {
        contentId: fd.get("contentId"),
        screenId: fd.get("screenId"),
        startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
        endsAt: new Date(String(fd.get("endsAt"))).toISOString(),
        capacity: Number(fd.get("capacity") || 100),
        seatingMode: fd.get("seatingMode") || "assigned",
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function openSale(id: string) {
    await apiSend(`/cinema/showtimes/${id}/open`, "POST", {});
    await load();
  }
  async function addTicketType(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/cinema/tickets/types", "POST", {
        showtimeId: fd.get("showtimeId"),
        name: fd.get("name"),
        code: fd.get("code"),
        price: Number(fd.get("price") || 0),
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
      <h2>Showtimes</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onCreate}>
        <select name="contentId" required>
          <option value="">Content</option>
          {content.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select name="screenId" required>
          <option value="">Screen</option>
          {screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <input name="endsAt" type="datetime-local" required />
        <input name="capacity" type="number" defaultValue={100} />
        <button type="submit">Schedule</button>
      </form>
      <form className="card-form" onSubmit={addTicketType}>
        <h3>Ticket type</h3>
        <select name="showtimeId" required>
          <option value="">Showtime</option>
          {showtimes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.content.title} @ {new Date(s.startsAt).toLocaleString()}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="price" type="number" step="0.01" defaultValue={12} />
        <input name="capacity" type="number" defaultValue={50} />
        <button type="submit">Add ticket type</button>
      </form>
      <ul className="list">
        {showtimes.map((s) => (
          <li key={s.id}>
            <strong>{s.content.title}</strong> · {s.screen.name} · {new Date(s.startsAt).toLocaleString()} ·{" "}
            {s.status} · {s.soldCount}/{s.capacity}
            {s.status !== "on_sale" && s.status !== "sold_out" && s.status !== "cancelled" && (
              <button type="button" className="btn ghost" onClick={() => openSale(s.id)}>
                Open for sale
              </button>
            )}
            <div className="muted">
              Tickets: {s.ticketTypes.map((t) => `${t.name} ($${t.price})`).join(", ") || "none"}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CinemaSeatsPage() {
  const [screens, setScreens] = useState<
    Array<{
      id: string;
      name: string;
      seatMap: { id: string; sections: Array<{ name: string; seats: Array<{ label: string; status: string }> }> } | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ screens: typeof screens }>("/cinema/screens");
    setScreens(d.screens);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onMap(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const rows = String(fd.get("rows") || "A,B").split(",").map((r) => r.trim()).filter(Boolean);
    const cols = Number(fd.get("cols") || 6);
    const seats = [];
    for (const row of rows) {
      for (let n = 1; n <= cols; n++) {
        seats.push({ label: `${row}${n}`, rowLabel: row });
      }
    }
    try {
      await apiSend("/cinema/seats/maps", "POST", {
        screenId: fd.get("screenId"),
        name: fd.get("name") || "Seat map",
        sections: [{ name: "Main", code: "MAIN", seats }],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Seat maps</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onMap}>
        <select name="screenId" required>
          <option value="">Screen</option>
          {screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Map name" defaultValue="Main map" />
        <input name="rows" placeholder="Rows (A,B,C)" defaultValue="A,B,C,D" />
        <input name="cols" type="number" placeholder="Seats per row" defaultValue={6} />
        <button type="submit">Configure map</button>
      </form>
      <ul className="list">
        {screens.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>
            {s.seatMap ? (
              <div className="muted">
                {s.seatMap.sections.map((sec) => (
                  <div key={sec.name}>
                    {sec.name}: {sec.seats.map((seat) => `${seat.label}(${seat.status})`).join(" ")}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No seat map</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CinemaTicketsPage() {
  const [tickets, setTickets] = useState<
    Array<{
      id: string;
      status: string;
      holderName: string | null;
      showtime: { content: { title: string }; startsAt: string };
      seat: { label: string } | null;
    }>
  >([]);
  useEffect(() => {
    apiGet<{ tickets: typeof tickets }>("/cinema/tickets").then((d) => setTickets(d.tickets));
  }, []);
  return (
    <section className="page">
      <h2>Tickets</h2>
      <ul className="list">
        {tickets.map((t) => (
          <li key={t.id}>
            {t.showtime.content.title} · {new Date(t.showtime.startsAt).toLocaleString()} ·{" "}
            {t.holderName ?? "Guest"} · {t.seat?.label ?? "GA"} · {t.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CinemaAttendeesPage() {
  const [attendees, setAttendees] = useState<
    Array<{
      id: string;
      displayName: string;
      checkInStatus: string;
      ticketId: string;
      showtime: { content: { title: string } };
    }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ attendees: typeof attendees }>("/cinema/attendees");
    setAttendees(d.attendees);
  }
  useEffect(() => {
    load().catch(() => undefined);
  }, []);
  async function checkIn(ticketId: string) {
    try {
      await apiSend("/cinema/check-in", "POST", { ticketId });
      setMsg("Checked in");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Attendees & check-in</h2>
      {msg && <p className="muted">{msg}</p>}
      <ul className="list">
        {attendees.map((a) => (
          <li key={a.id}>
            {a.displayName} · {a.showtime.content.title} · {a.checkInStatus}
            {a.checkInStatus !== "checked_in" && (
              <button type="button" className="btn ghost" onClick={() => checkIn(a.ticketId)}>
                Check in
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CinemaConcessionsPage() {
  const [concessions, setConcessions] = useState<
    Array<{ id: string; name: string; code: string; price: number; category: string }>
  >([]);
  const [orders, setOrders] = useState<
    Array<{ id: string; status: string; totalAmount: number; items: Array<{ quantity: number; concession: { name: string } }> }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [c, o] = await Promise.all([
      apiGet<{ concessions: typeof concessions }>("/cinema/concessions"),
      apiGet<{ orders: typeof orders }>("/cinema/orders"),
    ]);
    setConcessions(c.concessions);
    setOrders(o.orders);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onConcession(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/cinema/concessions", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        category: fd.get("category") || "snack",
        price: Number(fd.get("price") || 0),
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function onOrder(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/cinema/orders", "POST", {
        items: [{ concessionId: String(fd.get("concessionId")), quantity: Number(fd.get("quantity") || 1) }],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function setStatus(id: string, status: string) {
    await apiSend(`/cinema/orders/${id}/status`, "PATCH", { status });
    await load();
  }
  return (
    <section className="page">
      <h2>Concessions & orders</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onConcession}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="category" placeholder="Category" defaultValue="snack" />
        <input name="price" type="number" step="0.01" defaultValue={5} />
        <button type="submit">Add concession</button>
      </form>
      <form className="card-form" onSubmit={onOrder}>
        <h3>New order</h3>
        <select name="concessionId" required>
          <option value="">Item</option>
          {concessions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (${c.price})
            </option>
          ))}
        </select>
        <input name="quantity" type="number" defaultValue={1} />
        <button type="submit">Submit order</button>
      </form>
      <ul className="list">
        {orders.map((o) => (
          <li key={o.id}>
            #{o.id.slice(-6)} · {o.status} · ${o.totalAmount.toFixed(2)} ·{" "}
            {o.items.map((i) => `${i.quantity}x ${i.concession.name}`).join(", ")}
            {o.status === "submitted" && (
              <button type="button" onClick={() => setStatus(o.id, "preparing")}>
                Preparing
              </button>
            )}
            {o.status === "preparing" && (
              <button type="button" onClick={() => setStatus(o.id, "ready")}>
                Ready
              </button>
            )}
            {o.status === "ready" && (
              <button type="button" onClick={() => setStatus(o.id, "collected")}>
                Collected
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CinemaShiftsPage() {
  const [shifts, setShifts] = useState<
    Array<{ id: string; staffId: string; roleLabel: string; startsAt: string; status: string }>
  >([]);
  useEffect(() => {
    apiGet<{ shifts: typeof shifts }>("/cinema/shifts").then((d) => setShifts(d.shifts));
  }, []);
  return (
    <section className="page">
      <h2>Shifts</h2>
      <ul className="list">
        {shifts.map((s) => (
          <li key={s.id}>
            {s.roleLabel} · staff {s.staffId.slice(-6)} · {new Date(s.startsAt).toLocaleString()} · {s.status}
          </li>
        ))}
      </ul>
      {shifts.length === 0 && <p className="muted">No shifts scheduled.</p>}
    </section>
  );
}
