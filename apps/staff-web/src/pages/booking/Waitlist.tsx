import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";

type Entry = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  partySize: number;
  customer: { displayName: string };
  resource?: { name: string } | null;
};

export function BookingWaitlistPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ entries: Entry[] }>("/booking/waitlist")
      .then((d) => setEntries(d.entries))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Booking engine</p>
          <h2>Waitlists</h2>
          <p className="muted">Guests waiting for capacity — promotions notify when slots open.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="stack-list">
        {entries.length === 0 ? (
          <p className="muted">No waitlist entries.</p>
        ) : (
          entries.map((e) => (
            <article key={e.id} className="panel soft row-between">
              <div>
                <strong>{e.customer.displayName}</strong>
                <p className="muted small">
                  {e.resource?.name ?? "Any resource"} · party {e.partySize}
                </p>
                <p className="muted small">
                  {new Date(e.startsAt).toLocaleString()} → {new Date(e.endsAt).toLocaleString()}
                </p>
              </div>
              <span className="chip">{e.status}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
