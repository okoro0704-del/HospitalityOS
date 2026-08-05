import { useNavigate } from "react-router-dom";
import { getSession, logout } from "../lib/session";

export function ProfilePage() {
  const session = getSession();
  const navigate = useNavigate();
  const returnUrl =
    import.meta.env.VITE_LIFEOS_RETURN_URL ?? "http://localhost:5174/app/discover";

  async function onLogout() {
    await logout();
    window.location.href = returnUrl;
  }

  return (
    <section className="panel">
      <h2>Profile</h2>
      <dl className="profile-dl">
        <div>
          <dt>Name</dt>
          <dd>{session?.displayName}</dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd>{session?.experienceId}</dd>
        </div>
        <div>
          <dt>Scopes</dt>
          <dd>{session?.scopes.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt>Session expires</dt>
          <dd>{session ? new Date(session.expiresAt).toLocaleString() : "—"}</dd>
        </div>
      </dl>
      <div className="actions">
        <button type="button" className="btn" onClick={onLogout}>
          Sign out of HospitalityOS
        </button>
        <button type="button" className="btn ghost" onClick={() => navigate("/")}>
          Back home
        </button>
      </div>
      <p className="muted small">
        Signing out clears only your HospitalityOS session. LifeOS remains signed in.
      </p>
    </section>
  );
}
