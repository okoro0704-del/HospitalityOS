import { useEffect, useState } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Guest = {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  lifeosUserId?: string | null;
  trustId?: string | null;
  stayCount: number;
  notes: Array<{ id: string; body: string }>;
};

export function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ guests: Guest[] }>("/accommodation/guests");
    setGuests(data.guests);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function addNote(id: string) {
    const body = noteDrafts[id]?.trim();
    if (!body) return;
    await apiSend(`/accommodation/guests/${id}/notes`, "POST", { body });
    setNoteDrafts((d) => ({ ...d, [id]: "" }));
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h2>Guests</h2>
          <p className="muted">
            Profiles mapped from LifeOS/TrustID when available, with stay history and notes.
          </p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="stack-list">
        {guests.map((g) => (
          <article key={g.id} className="panel soft">
            <div className="row-between">
              <strong>{g.displayName}</strong>
              <span className="chip quiet">{g.stayCount} recent stays</span>
            </div>
            <p className="muted small">
              {g.email ?? "No email"} · {g.phone ?? "No phone"}
            </p>
            <p className="muted small">
              LifeOS: {g.lifeosUserId ?? "—"} · TrustID: {g.trustId ?? "—"}
            </p>
            {g.notes.map((n) => (
              <p key={n.id} className="small">
                Note: {n.body}
              </p>
            ))}
            <div className="inline-form">
              <input
                placeholder="Add staff note"
                value={noteDrafts[g.id] ?? ""}
                onChange={(e) => setNoteDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
              />
              <button type="button" className="btn" onClick={() => addNote(g.id)}>
                Save note
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
