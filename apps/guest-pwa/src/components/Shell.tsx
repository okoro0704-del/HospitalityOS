import { NavLink, Outlet } from "react-router-dom";
import { getSession } from "../lib/session";

export function Shell() {
  const session = getSession();

  return (
    <div className="guest-app">
      <header className="guest-top">
        <div>
          <p className="brand">HospitalityOS</p>
          <h1>{session?.displayName ? `Welcome, ${session.displayName}` : "Guest"}</h1>
        </div>
      </header>
      <main className="guest-main">
        <Outlet />
      </main>
      <nav className="guest-nav" aria-label="Guest navigation">
        <NavLink to="/home" end>
          Home
        </NavLink>
        <NavLink to="/catalog">Catalog</NavLink>
        <NavLink to="/dining">Dining</NavLink>
        <NavLink to="/fitness">Fitness</NavLink>
        <NavLink to="/spa">Spa</NavLink>
        <NavLink to="/events">Events</NavLink>
        <NavLink to="/cinema">Cinema</NavLink>
        <NavLink to="/stay">Stay</NavLink>
        <NavLink to="/my-bookings">Bookings</NavLink>
        <NavLink to="/notifications">Alerts</NavLink>
        <NavLink to="/payments">Payments</NavLink>
        <NavLink to="/profile">Profile</NavLink>
      </nav>
    </div>
  );
}
