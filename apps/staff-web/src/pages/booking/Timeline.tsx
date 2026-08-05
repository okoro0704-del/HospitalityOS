import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";

type Event = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  createdAt: string;
};

export function BookingTimelinePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ events: Event[] }>("/booking/audit-events")
      .then((d) => setEvents(d.events))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Booking engine</p>
          <h2>Booking timeline</h2>
          <p className="muted">Audit trail for bookings, schedules, policies, and waitlists.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="stack-list">
        {events.map((e) => (
          <article key={e.id} className="panel soft">
            <strong>{e.action}</strong>
            <p className="muted small">
              {e.resource} {e.resourceId ?? ""} · {new Date(e.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
