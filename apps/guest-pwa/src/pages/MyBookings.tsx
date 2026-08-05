import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Booking = {
  id: string;
  confirmationCode: string;
  status: string;
  moduleId: string;
  startsAt: string;
  endsAt: string;
  timeline?: Array<{ eventType: string; message: string; createdAt: string }>;
};

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ bookings: Booking[] }>("/guest/booking/bookings");
    setBookings(data.bookings);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function cancel(id: string) {
    try {
      await apiSend(`/guest/booking/bookings/${id}/cancel`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  return (
    <section className="panel">
      <h2>My bookings</h2>
      <p className="muted">Universal booking history and timeline.</p>
      {error && <p className="error">{error}</p>}
      <Link className="btn" to="/book">
        New booking
      </Link>
      <div className="module-grid">
        {bookings.map((b) => (
          <article key={b.id} className="module-tile">
            <h3>{b.confirmationCode}</h3>
            <p className="muted small">
              {b.moduleId} · {new Date(b.startsAt).toLocaleString()} →{" "}
              {new Date(b.endsAt).toLocaleString()}
            </p>
            <span className="chip">{b.status}</span>
            {b.timeline && b.timeline.length > 0 && (
              <ul className="timeline">
                {b.timeline.slice(-3).map((t, i) => (
                  <li key={`${b.id}-${i}`} className="muted small">
                    {t.message}
                  </li>
                ))}
              </ul>
            )}
            {["draft", "pending", "confirmed", "waitlisted"].includes(b.status) && (
              <button type="button" className="btn ghost" onClick={() => cancel(b.id)}>
                Cancel
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
