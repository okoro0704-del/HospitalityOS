import { Link, Navigate } from "react-router-dom";
import { getSession } from "../lib/session";

/** Public entry — explains HospitalityOS and routes into venue selection. */
export function LandingPage() {
  const session = getSession();
  if (session) return <Navigate to="/home" replace />;

  return (
    <div className="landing">
      <header className="landing-hero">
        <p className="brand">HospitalityOS</p>
        <h1>One operating system for hospitality experiences</h1>
        <p className="lede">
          Hotels, restaurants, gyms, spas, events, and cinemas — guests enter a venue and
          manage stays, bookings, tickets, and more from one hub.
        </p>
        <div className="actions">
          <Link className="btn" to="/start">
            Enter a demo venue
          </Link>
        </div>
        <p className="muted small">
          Production guests arrive via LifeOS experience handoff. Demo entry uses a
          HospitalityOS-local session (no TrustID credentials).
        </p>
      </header>
      <section className="landing-grid">
        <article>
          <h2>Stay & dine</h2>
          <p>Rooms, reservations, menus, and table booking.</p>
        </article>
        <article>
          <h2>Wellness</h2>
          <p>Gym memberships, classes, spa treatments, and packages.</p>
        </article>
        <article>
          <h2>Entertainment</h2>
          <p>Events, venues, cinema showtimes, and tickets.</p>
        </article>
        <article>
          <h2>Account</h2>
          <p>Profile, notifications, invoices, and receipts.</p>
        </article>
      </section>
    </div>
  );
}
