import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Notif = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  deepLink: string | null;
  createdAt: string;
  readAt: string | null;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "bookings", label: "Bookings" },
  { key: "orders", label: "Orders" },
  { key: "events", label: "Events" },
  { key: "promotions", label: "Promotions" },
];

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "all";
  const [items, setItems] = useState<Notif[]>([]);
  const [prefs, setPrefs] = useState<{
    inAppEnabled: boolean;
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    marketingEmail: boolean;
    marketingSms: boolean;
    marketingPush: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    const qs =
      filter === "unread"
        ? "?status=unread"
        : filter !== "all"
          ? `?filter=${encodeURIComponent(filter)}`
          : "";
    apiGet<{ notifications: Notif[] }>(`/guest/notifications${qs}`)
      .then((d) => setItems(d.notifications))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }

  useEffect(() => {
    load();
    apiGet<{ preferences: NonNullable<typeof prefs> }>("/guest/notifications/preferences")
      .then((d) => setPrefs(d.preferences))
      .catch(() => undefined);
  }, [filter]);

  async function markRead(id: string) {
    await apiSend(`/guest/notifications/${id}/read`, "POST");
    load();
  }

  async function markAll() {
    await apiSend("/guest/notifications/read-all", "POST");
    load();
  }

  async function savePrefs(e: FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    const fd = new FormData(e.target as HTMLFormElement);
    const body = {
      inAppEnabled: fd.get("inApp") === "on",
      emailEnabled: fd.get("email") === "on",
      smsEnabled: fd.get("sms") === "on",
      pushEnabled: fd.get("push") === "on",
      marketingEmail: fd.get("mEmail") === "on",
      marketingSms: fd.get("mSms") === "on",
      marketingPush: fd.get("mPush") === "on",
    };
    const d = await apiSend<{ preferences: NonNullable<typeof prefs> }>(
      "/guest/notifications/preferences",
      "PATCH",
      body,
    );
    setPrefs(d.preferences);
  }

  return (
    <section className="panel">
      <h2>Notifications</h2>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "btn" : "btn ghost"}
            onClick={() => setParams(f.key === "all" ? {} : { filter: f.key })}
          >
            {f.label}
          </button>
        ))}
        <button type="button" className="btn ghost" onClick={markAll}>
          Mark all read
        </button>
      </div>
      <ul className="list">
        {items.map((n) => (
          <li key={n.id}>
            <strong>{n.title}</strong>
            <p className="muted">
              {n.category} · {new Date(n.createdAt).toLocaleString()} · {n.status}
            </p>
            <p>{n.body}</p>
            <div className="actions">
              {n.status === "unread" && (
                <button type="button" className="btn ghost" onClick={() => markRead(n.id)}>
                  Mark read
                </button>
              )}
              {n.deepLink && (
                <Link className="btn ghost" to={n.deepLink}>
                  Open
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="muted">No notifications.</p>}

      <h3>Communication preferences</h3>
      {prefs && (
        <form className="card-form" onSubmit={savePrefs}>
          <p className="muted">Transactional</p>
          <label>
            <input name="inApp" type="checkbox" defaultChecked={prefs.inAppEnabled} /> In-App
          </label>
          <label>
            <input name="email" type="checkbox" defaultChecked={prefs.emailEnabled} /> Email
          </label>
          <label>
            <input name="push" type="checkbox" defaultChecked={prefs.pushEnabled} /> Push
          </label>
          <label>
            <input name="sms" type="checkbox" defaultChecked={prefs.smsEnabled} /> SMS (optional)
          </label>
          <p className="muted">Marketing</p>
          <label>
            <input name="mEmail" type="checkbox" defaultChecked={prefs.marketingEmail} /> Email
          </label>
          <label>
            <input name="mSms" type="checkbox" defaultChecked={prefs.marketingSms} /> SMS
          </label>
          <label>
            <input name="mPush" type="checkbox" defaultChecked={prefs.marketingPush} /> Push
          </label>
          <button type="submit">Save preferences</button>
        </form>
      )}
    </section>
  );
}
