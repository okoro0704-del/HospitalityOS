import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/api";

type Notif = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  deepLink: string | null;
  createdAt: string;
};

export function StaffNotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [error, setError] = useState<string | null>(null);
  function load() {
    apiGet<{ notifications: Notif[] }>("/staff/notifications")
      .then((d) => setItems(d.notifications))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(() => {
    load();
  }, []);
  async function markRead(id: string) {
    await apiSend(`/notifications/${id}/read`, "POST");
    load();
  }
  async function markAll() {
    await apiSend("/notifications/read-all", "POST");
    load();
  }
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Communications</p>
          <h2>Staff notifications</h2>
        </div>
        <div className="actions">
          <Link className="btn ghost" to="/notifications/templates">
            Templates
          </Link>
          <Link className="btn ghost" to="/notifications/rules">
            Rules
          </Link>
          <Link className="btn ghost" to="/notifications/deliveries">
            Deliveries
          </Link>
          <Link className="btn ghost" to="/notifications/preferences">
            Preferences
          </Link>
          <button type="button" className="btn" onClick={markAll}>
            Mark all read
          </button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {items.map((n) => (
          <li key={n.id}>
            <strong>{n.title}</strong>
            <p className="muted">
              {n.category} · {n.status} · {new Date(n.createdAt).toLocaleString()}
            </p>
            <p>{n.body}</p>
            {n.status === "unread" && (
              <button type="button" className="btn ghost" onClick={() => markRead(n.id)}>
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="muted">No staff notifications.</p>}
    </section>
  );
}

export function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<
    Array<{ id: string; code: string; name: string; type: string; version: number; body: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  function load() {
    apiGet<{ templates: typeof templates }>("/notifications/templates")
      .then((d) => setTemplates(d.templates))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(() => {
    load();
  }, []);
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/notifications/templates", "POST", {
      code: fd.get("code"),
      name: fd.get("name"),
      category: fd.get("category") || "booking",
      type: fd.get("type") || "transactional",
      subject: fd.get("subject"),
      body: fd.get("body"),
      variables: ["customer.firstName", "business.name", "booking.reference"],
    });
    await load();
    (e.target as HTMLFormElement).reset();
  }
  return (
    <section className="page">
      <Link to="/notifications">← Notifications</Link>
      <h2>Templates</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onCreate}>
        <input name="code" placeholder="Code" required />
        <input name="name" placeholder="Name" required />
        <input name="subject" placeholder="Subject" />
        <select name="category" defaultValue="booking">
          <option value="booking">Booking</option>
          <option value="order">Order</option>
          <option value="operational">Operational</option>
          <option value="system">System</option>
        </select>
        <select name="type" defaultValue="transactional">
          <option value="transactional">Transactional</option>
          <option value="operational">Operational</option>
          <option value="system">System</option>
        </select>
        <textarea
          name="body"
          placeholder="Hello {{customer.firstName}} at {{business.name}}"
          required
        />
        <button type="submit">Create template</button>
      </form>
      <ul className="list">
        {templates.map((t) => (
          <li key={t.id}>
            {t.name} ({t.code} v{t.version}) · {t.type}
            <p className="muted">{t.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NotificationRulesPage() {
  const [rules, setRules] = useState<
    Array<{ id: string; code: string; name: string; eventType: string; enabled: boolean }>
  >([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; code: string }>>([]);
  function load() {
    apiGet<{ rules: typeof rules }>("/notifications/rules").then((d) => setRules(d.rules));
    apiGet<{ templates: typeof templates }>("/notifications/templates").then((d) =>
      setTemplates(d.templates),
    );
  }
  useEffect(() => {
    load();
  }, []);
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/notifications/rules", "POST", {
      code: fd.get("code"),
      name: fd.get("name"),
      eventType: fd.get("eventType"),
      templateId: fd.get("templateId") || undefined,
      channels: ["in_app"],
      audience: fd.get("audience") || "customer",
      category: "booking",
      deepLinkTpl: fd.get("deepLink") || undefined,
    });
    await load();
  }
  async function toggle(id: string, enabled: boolean) {
    await apiSend(`/notifications/rules/${id}`, "PATCH", { enabled: !enabled });
    await load();
  }
  return (
    <section className="page">
      <Link to="/notifications">← Notifications</Link>
      <h2>Rules</h2>
      <form className="card-form" onSubmit={onCreate}>
        <input name="code" placeholder="Code" required />
        <input name="name" placeholder="Name" required />
        <input name="eventType" placeholder="BOOKING_CONFIRMED" required />
        <select name="audience" defaultValue="customer">
          <option value="customer">Customer</option>
          <option value="staff">Staff</option>
        </select>
        <select name="templateId" defaultValue="">
          <option value="">No template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input name="deepLink" placeholder="/my-bookings" />
        <button type="submit">Create rule</button>
      </form>
      <ul className="list">
        {rules.map((r) => (
          <li key={r.id}>
            {r.name} · {r.eventType} · {r.enabled ? "enabled" : "disabled"}
            <button type="button" className="btn ghost" onClick={() => toggle(r.id, r.enabled)}>
              Toggle
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NotificationDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<
    Array<{ id: string; channel: string; status: string; lastError: string | null; attemptCount: number }>
  >([]);
  useEffect(() => {
    apiGet<{ deliveries: typeof deliveries }>("/notifications/deliveries").then((d) =>
      setDeliveries(d.deliveries),
    );
  }, []);
  async function retry(id: string) {
    await apiSend(`/notifications/deliveries/${id}/retry`, "POST");
    const d = await apiGet<{ deliveries: typeof deliveries }>("/notifications/deliveries");
    setDeliveries(d.deliveries);
  }
  return (
    <section className="page">
      <Link to="/notifications">← Notifications</Link>
      <h2>Deliveries</h2>
      <ul className="list">
        {deliveries.map((d) => (
          <li key={d.id}>
            {d.channel} · {d.status} · attempts {d.attemptCount}
            {d.lastError && <span className="muted"> · {d.lastError}</span>}
            {d.status === "failed" && (
              <button type="button" className="btn ghost" onClick={() => retry(d.id)}>
                Retry
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    apiGet<{ preferences: Record<string, boolean> }>("/notifications/preferences").then((d) =>
      setPrefs(d.preferences),
    );
  }, []);
  async function onSave(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const body = {
      inAppEnabled: fd.get("inApp") === "on",
      emailEnabled: fd.get("email") === "on",
      smsEnabled: fd.get("sms") === "on",
      pushEnabled: fd.get("push") === "on",
    };
    const d = await apiSend<{ preferences: Record<string, boolean> }>(
      "/notifications/preferences",
      "PATCH",
      body,
    );
    setPrefs(d.preferences);
  }
  if (!prefs) return <p className="muted">Loading…</p>;
  return (
    <section className="page">
      <Link to="/notifications">← Notifications</Link>
      <h2>Preferences</h2>
      <form className="card-form" onSubmit={onSave}>
        <label>
          <input name="inApp" type="checkbox" defaultChecked={!!prefs.inAppEnabled} /> In-App
        </label>
        <label>
          <input name="email" type="checkbox" defaultChecked={!!prefs.emailEnabled} /> Email
        </label>
        <label>
          <input name="sms" type="checkbox" defaultChecked={!!prefs.smsEnabled} /> SMS
        </label>
        <label>
          <input name="push" type="checkbox" defaultChecked={!!prefs.pushEnabled} /> Push
        </label>
        <button type="submit">Save</button>
      </form>
    </section>
  );
}
