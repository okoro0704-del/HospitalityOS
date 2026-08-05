import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Menu = {
  id: string;
  name: string;
  featured: boolean;
  sections: Array<{
    id: string;
    name: string;
    items: Array<{ id: string; name: string; description: string | null; price: number; featured: boolean }>;
  }>;
};

export function DiningBrowsePage() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [featured, setFeatured] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ menus: Menu[] }>("/guest/dining/menus"),
      apiGet<{ featured: typeof featured }>("/guest/dining/offers"),
    ])
      .then(([m, f]) => {
        setMenus(m.menus);
        setFeatured(f.featured);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="panel">
      <h2>Dining</h2>
      <p className="muted">Browse menus and reserve a table. No online payments yet.</p>
      {error && <p className="error">{error}</p>}
      <Link className="btn" to="/dining/reserve">
        Reserve a table
      </Link>
      <Link className="btn ghost" to="/dining/reservations" style={{ marginLeft: "0.5rem" }}>
        My reservations
      </Link>
      {featured.length > 0 && (
        <>
          <h3>Featured</h3>
          <div className="module-grid">
            {featured.map((f) => (
              <article key={f.id} className="module-tile">
                <h3>{f.name}</h3>
                <p>{f.price.toFixed(2)}</p>
              </article>
            ))}
          </div>
        </>
      )}
      {menus.map((m) => (
        <article key={m.id} style={{ marginTop: "1.25rem" }}>
          <h3>
            {m.name} {m.featured ? "★" : ""}
          </h3>
          {m.sections.map((s) => (
            <div key={s.id}>
              <h4>{s.name}</h4>
              <ul className="timeline">
                {s.items.map((i) => (
                  <li key={i.id}>
                    <strong>{i.name}</strong> — {i.price.toFixed(2)}
                    {i.description ? <span className="muted small"> · {i.description}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

export function DiningReservePage() {
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([]);
  const [areaId, setAreaId] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [seatingAt, setSeatingAt] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ areas: typeof areas }>("/guest/dining/areas")
      .then((d) => {
        setAreas(d.areas);
        if (d.areas[0]) setAreaId(d.areas[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await apiSend<{ reservation?: { confirmationCode: string }; waitlistEntry?: unknown }>(
        "/guest/dining/reservations",
        "POST",
        {
          diningAreaId: areaId || undefined,
          partySize: Number(partySize),
          seatingAt: new Date(seatingAt).toISOString(),
          notes: notes || undefined,
          joinWaitlistIfUnavailable: true,
        },
      );
      if (res.reservation) {
        setMessage(`Reserved: ${res.reservation.confirmationCode}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (msg.toLowerCase().includes("waitlist")) setMessage(msg);
      else setError(msg);
    }
  }

  return (
    <section className="panel">
      <Link className="muted small" to="/dining">
        ← Menus
      </Link>
      <h2>Reserve a table</h2>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <form className="book-form" onSubmit={onSubmit}>
        <label>
          Area
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Party size
          <input type="number" min={1} value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        </label>
        <label>
          Seating time
          <input
            type="datetime-local"
            value={seatingAt}
            onChange={(e) => setSeatingAt(e.target.value)}
            required
          />
        </label>
        <label>
          Notes
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="btn" type="submit">
          Reserve / waitlist
        </button>
      </form>
    </section>
  );
}

export function DiningReservationsGuestPage() {
  const [reservations, setReservations] = useState<
    Array<{
      id: string;
      confirmationCode: string;
      seatingAt: string;
      partySize: number;
      status: string;
      table?: { name: string } | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ reservations: typeof reservations }>("/guest/dining/reservations");
    setReservations(data.reservations);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function cancel(id: string) {
    await apiSend(`/guest/dining/reservations/${id}/cancel`, "POST");
    await load();
  }

  return (
    <section className="panel">
      <Link className="muted small" to="/dining">
        ← Dining
      </Link>
      <h2>Dining history</h2>
      {error && <p className="error">{error}</p>}
      <div className="module-grid">
        {reservations.map((r) => (
          <article key={r.id} className="module-tile">
            <h3>{r.confirmationCode}</h3>
            <p className="muted small">
              {new Date(r.seatingAt).toLocaleString()} · party {r.partySize}
              {r.table ? ` · ${r.table.name}` : ""}
            </p>
            <span className="chip">{r.status}</span>
            {["pending", "confirmed"].includes(r.status) && (
              <button type="button" className="btn ghost" onClick={() => cancel(r.id)}>
                Cancel
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
