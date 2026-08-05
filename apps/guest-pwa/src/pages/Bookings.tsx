import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Reservation = {
  id: string;
  confirmationCode: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  propertyName: string;
  roomTypeName: string;
  upcoming: boolean;
};

export function BookingsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ reservations: Reservation[] }>(
      "/guest/accommodation/reservations",
    );
    setReservations(data.reservations);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function cancel(id: string) {
    setError(null);
    try {
      await apiSend(`/guest/accommodation/reservations/${id}/cancel`, "POST");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  const upcoming = reservations.filter((r) => r.upcoming);
  const past = reservations.filter((r) => !r.upcoming);

  return (
    <section className="panel">
      <h2>Bookings</h2>
      <p className="muted">Your stays — recognized via your LifeOS session.</p>
      {error && <p className="error">{error}</p>}
      <Link className="btn" to="/stay">
        Browse rooms
      </Link>
      <h3>Upcoming</h3>
      {upcoming.length === 0 ? (
        <div className="placeholder-block">
          <p>No upcoming stays</p>
        </div>
      ) : (
        <div className="module-grid">
          {upcoming.map((r) => (
            <article key={r.id} className="module-tile">
              <h3>{r.confirmationCode}</h3>
              <p>
                {r.propertyName} · {r.roomTypeName}
              </p>
              <p className="muted small">
                {r.checkInDate} → {r.checkOutDate}
              </p>
              <span className="chip">{r.status.replaceAll("_", " ")}</span>
              {["draft", "pending", "confirmed"].includes(r.status) && (
                <button type="button" className="btn ghost" onClick={() => cancel(r.id)}>
                  Cancel
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      <h3>History</h3>
      {past.length === 0 ? (
        <p className="muted">No past reservations yet.</p>
      ) : (
        <div className="module-grid">
          {past.map((r) => (
            <article key={r.id} className="module-tile">
              <h3>{r.confirmationCode}</h3>
              <p className="muted small">
                {r.checkInDate} → {r.checkOutDate} · {r.status}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
