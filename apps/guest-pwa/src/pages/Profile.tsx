import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiSend, getSession, logout } from "../lib/session";

type GuestCustomer = {
  customer: {
    id: string;
    displayName: string;
    email?: string | null;
    phone?: string | null;
    preferredLanguage?: string | null;
  } | null;
  loyalty: { status: string; pointsBalance: number; tier: string | null } | null;
};

export function ProfilePage() {
  const session = getSession();
  const navigate = useNavigate();
  const returnUrl =
    import.meta.env.VITE_LIFEOS_RETURN_URL ?? "http://localhost:5174/app/discover";
  const [profile, setProfile] = useState<GuestCustomer | null>(null);
  const [timeline, setTimeline] = useState<
    Array<{ id: string; title: string; occurredAt: string; sourceModule: string }>
  >([]);
  const [feedback, setFeedback] = useState<Array<{ id: string; rating: number; comment: string | null }>>(
    [],
  );
  const [prefs, setPrefs] = useState<Array<{ key: string; value: unknown }>>([]);

  useEffect(() => {
    if (!session) return;
    apiGet<GuestCustomer>("/guest/customer")
      .then(setProfile)
      .catch(() => undefined);
    apiGet<{ timeline: typeof timeline }>("/guest/customer/timeline")
      .then((d) => setTimeline(d.timeline.slice(0, 20)))
      .catch(() => undefined);
    apiGet<{ feedback: typeof feedback }>("/guest/customer/feedback")
      .then((d) => setFeedback(d.feedback))
      .catch(() => undefined);
    apiGet<{ preferences: typeof prefs }>("/guest/customer/preferences")
      .then((d) => setPrefs(d.preferences))
      .catch(() => undefined);
  }, [session]);

  async function onLogout() {
    await logout();
    window.location.href = returnUrl;
  }

  async function onPref(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/guest/customer/preferences", "PATCH", {
      key: fd.get("key"),
      value: fd.get("value"),
    });
    const d = await apiGet<{ preferences: typeof prefs }>("/guest/customer/preferences");
    setPrefs(d.preferences);
    (e.target as HTMLFormElement).reset();
  }

  async function onFeedback(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/guest/customer/feedback", "POST", {
      rating: Number(fd.get("rating")),
      comment: fd.get("comment") || undefined,
    });
    const d = await apiGet<{ feedback: typeof feedback }>("/guest/customer/feedback");
    setFeedback(d.feedback);
  }

  return (
    <section className="panel">
      <h2>Profile</h2>
      <dl className="profile-dl">
        <div>
          <dt>Name</dt>
          <dd>{profile?.customer?.displayName ?? session?.displayName}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{profile?.customer?.email ?? "—"}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{profile?.customer?.phone ?? "—"}</dd>
        </div>
        <div>
          <dt>Loyalty</dt>
          <dd>
            {profile?.loyalty
              ? `${profile.loyalty.status} · ${profile.loyalty.pointsBalance} pts`
              : "Not enrolled"}
          </dd>
        </div>
        <div>
          <dt>Experience</dt>
          <dd>{session?.experienceId}</dd>
        </div>
      </dl>

      <h3>Preferences</h3>
      <ul className="list">
        {prefs.map((p) => (
          <li key={p.key}>
            {p.key}: {String(p.value)}
          </li>
        ))}
      </ul>
      <form className="card-form" onSubmit={onPref}>
        <input name="key" placeholder="Preference key" required />
        <input name="value" placeholder="Value" required />
        <button type="submit">Save preference</button>
      </form>

      <h3>Recent experiences</h3>
      <ul className="list">
        {timeline.map((t) => (
          <li key={t.id}>
            {new Date(t.occurredAt).toLocaleString()} · {t.sourceModule} · {t.title}
          </li>
        ))}
      </ul>
      {timeline.length === 0 && <p className="muted">No timeline events yet.</p>}

      <h3>Your feedback</h3>
      <form className="card-form" onSubmit={onFeedback}>
        <input name="rating" type="number" min={1} max={5} defaultValue={5} required />
        <input name="comment" placeholder="Comment" />
        <button type="submit">Submit feedback</button>
      </form>
      <ul className="list">
        {feedback.map((f) => (
          <li key={f.id}>
            {f.rating}/5 · {f.comment ?? "—"}
          </li>
        ))}
      </ul>

      <div className="actions">
        <button type="button" className="btn" onClick={onLogout}>
          Sign out of HospitalityOS
        </button>
        <button type="button" className="btn ghost" onClick={() => navigate("/")}>
          Back home
        </button>
      </div>
      <p className="muted small">
        Signing out clears only your HospitalityOS session. LifeOS remains signed in. Internal staff
        notes and tags are never shown here.
      </p>
    </section>
  );
}
