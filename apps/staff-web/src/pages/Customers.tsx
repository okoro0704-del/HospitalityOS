import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../lib/api";

type Customer = {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  lifeosUserId?: string | null;
  trustId?: string | null;
  externalIdentityRef?: string | null;
};

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(query?: string) {
    const path = query?.trim()
      ? `/search/customers?q=${encodeURIComponent(query.trim())}`
      : "/customers";
    const d = await apiGet<{ customers: Customer[] }>(path);
    setCustomers(d.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/customers", "POST", {
        displayName: fd.get("displayName"),
        email: fd.get("email") || undefined,
        phone: fd.get("phone") || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await load(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">CRM</p>
          <h2>Customers</h2>
        </div>
        <div className="row-actions">
          <Link className="btn ghost" to="/customers/segments">
            Segments
          </Link>
          <Link className="btn ghost" to="/customers/tags">
            Tags
          </Link>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form
        className="card-form"
        onSubmit={(e) => {
          e.preventDefault();
          load(q).catch((err) => setError(err instanceof Error ? err.message : "Failed"));
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, TrustID…" />
        <button type="submit">Search</button>
      </form>
      <form className="card-form" onSubmit={onCreate}>
        <h3>New customer</h3>
        <input name="displayName" placeholder="Display name" required />
        <input name="email" placeholder="Email" type="email" />
        <input name="phone" placeholder="Phone" />
        <button type="submit">Create</button>
      </form>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.displayName}</td>
              <td>{c.email ?? "—"}</td>
              <td>{c.status}</td>
              <td>
                <Link to={`/customers/${c.id}`}>Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<{
    customer: Customer & { preferredLanguage?: string | null };
    tags: Array<{ id: string; name: string; code: string }>;
    loyalty: { status: string; tier: string | null; pointsBalance: number } | null;
  } | null>(null);
  const [timeline, setTimeline] = useState<
    Array<{ id: string; eventType: string; title: string; occurredAt: string; sourceModule: string }>
  >([]);
  const [notes, setNotes] = useState<Array<{ id: string; body: string; createdAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiGet<NonNullable<typeof data>>(`/customers/${id}`),
      apiGet<{ timeline: typeof timeline }>(`/customers/${id}/timeline`).catch(() => ({ timeline: [] })),
      apiGet<{ notes: typeof notes }>(`/customers/${id}/notes`).catch(() => ({ notes: [] })),
    ])
      .then(([profile, tl, n]) => {
        setData(profile);
        setTimeline(tl.timeline);
        setNotes(n.notes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [id]);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend(`/customers/${id}/notes`, "POST", { body: fd.get("body") });
    const n = await apiGet<{ notes: typeof notes }>(`/customers/${id}/notes`);
    setNotes(n.notes);
    (e.target as HTMLFormElement).reset();
  }

  async function addInteraction(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend(`/customers/${id}/interactions`, "POST", {
      type: fd.get("type") || "general",
      notes: fd.get("notes"),
    });
    const tl = await apiGet<{ timeline: typeof timeline }>(`/customers/${id}/timeline`);
    setTimeline(tl.timeline);
  }

  if (!data) return <p className="muted">{error ?? "Loading…"}</p>;
  const c = data.customer;

  return (
    <section className="page">
      <Link to="/customers">← Customers</Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">Customer profile</p>
          <h2>{c.displayName}</h2>
          <p className="muted">
            {c.email ?? "—"} · {c.phone ?? "—"} · {c.status}
          </p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="stat-row">
        <article className="stat">
          <p className="muted">LifeOS</p>
          <strong>{c.lifeosUserId ?? "—"}</strong>
        </article>
        <article className="stat">
          <p className="muted">TrustID ref</p>
          <strong>{c.trustId ?? c.externalIdentityRef ?? "—"}</strong>
        </article>
        <article className="stat">
          <p className="muted">Loyalty</p>
          <strong>
            {data.loyalty
              ? `${data.loyalty.status}${data.loyalty.tier ? ` / ${data.loyalty.tier}` : ""} (${data.loyalty.pointsBalance} pts)`
              : "none"}
          </strong>
        </article>
      </div>
      <h3>Tags</h3>
      <p className="muted">{data.tags.map((t) => t.name).join(", ") || "No tags"}</p>
      <h3>Timeline</h3>
      <ul className="list">
        {timeline.map((t) => (
          <li key={t.id}>
            {new Date(t.occurredAt).toLocaleString()} · {t.sourceModule} · {t.title} ({t.eventType})
          </li>
        ))}
      </ul>
      <h3>Internal notes</h3>
      <form className="card-form" onSubmit={addNote}>
        <input name="body" placeholder="Note" required />
        <button type="submit">Add note</button>
      </form>
      <ul className="list">
        {notes.map((n) => (
          <li key={n.id}>
            {n.body} · <span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <h3>Log interaction</h3>
      <form className="card-form" onSubmit={addInteraction}>
        <select name="type" defaultValue="general">
          <option value="phone_call">Phone</option>
          <option value="email">Email</option>
          <option value="in_person">In person</option>
          <option value="follow_up">Follow-up</option>
          <option value="general">General</option>
        </select>
        <input name="notes" placeholder="Notes" />
        <button type="submit">Save</button>
      </form>
      <p className="muted">Customer merge is available via API only (UI disabled).</p>
    </section>
  );
}

export function CustomerSegmentsPage() {
  const [segments, setSegments] = useState<
    Array<{ id: string; name: string; code: string; rules: Record<string, unknown> }>
  >([]);
  const [members, setMembers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ segments: typeof segments }>("/segments");
    setSegments(d.segments);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/segments", "POST", {
      name: fd.get("name"),
      code: fd.get("code"),
      rules: { minBookings: Number(fd.get("minBookings") || 0) || undefined },
    });
    await load();
  }
  async function openMembers(id: string) {
    const d = await apiGet<{ customers: Customer[] }>(`/segments/${id}/members`);
    setMembers(d.customers);
  }
  return (
    <section className="page">
      <Link to="/customers">← Customers</Link>
      <h2>Segments</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onCreate}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="minBookings" type="number" placeholder="Min bookings" defaultValue={1} />
        <button type="submit">Create</button>
      </form>
      <ul className="list">
        {segments.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong> ({s.code})
            <button type="button" className="btn ghost" onClick={() => openMembers(s.id)}>
              Members
            </button>
          </li>
        ))}
      </ul>
      {members.length > 0 && (
        <>
          <h3>Members</h3>
          <ul className="list">
            {members.map((m) => (
              <li key={m.id}>
                <Link to={`/customers/${m.id}`}>{m.displayName}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function CustomerTagsPage() {
  const [tags, setTags] = useState<Array<{ id: string; name: string; code: string }>>([]);
  useEffect(() => {
    apiGet<{ tags: typeof tags }>("/tags").then((d) => setTags(d.tags));
  }, []);
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/tags", "POST", { name: fd.get("name"), code: fd.get("code") });
    const d = await apiGet<{ tags: typeof tags }>("/tags");
    setTags(d.tags);
  }
  return (
    <section className="page">
      <Link to="/customers">← Customers</Link>
      <h2>Tags</h2>
      <form className="card-form" onSubmit={onCreate}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <button type="submit">Create tag</button>
      </form>
      <ul className="list">
        {tags.map((t) => (
          <li key={t.id}>
            {t.name} ({t.code})
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CustomerInteractionsPage() {
  return (
    <section className="page">
      <h2>Interactions</h2>
      <p className="muted">Open a customer profile to log phone, email, or in-person interactions.</p>
      <Link className="btn" to="/customers">
        Browse customers
      </Link>
    </section>
  );
}

export function CustomerFeedbackPage() {
  return (
    <section className="page">
      <h2>Feedback</h2>
      <p className="muted">Feedback is attached per customer. Open a profile or collect via Guest PWA.</p>
      <Link className="btn" to="/customers">
        Browse customers
      </Link>
    </section>
  );
}

export function CustomerConsentPage() {
  return (
    <section className="page">
      <h2>Consent</h2>
      <p className="muted">Manage marketing and data-processing consent from the customer profile APIs.</p>
      <Link className="btn" to="/customers">
        Browse customers
      </Link>
    </section>
  );
}

export function CustomerLoyaltyPage() {
  return (
    <section className="page">
      <h2>Loyalty</h2>
      <p className="muted">
        Business loyalty foundation (points/tier placeholders). No token or LifeOS ecosystem wallet integration.
      </p>
      <Link className="btn" to="/customers">
        Browse customers
      </Link>
    </section>
  );
}
