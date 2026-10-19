import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/session";

type ActivityItem = {
  id: string;
  category: string;
  title: string;
  status: string;
  at: string;
  href: string;
  amount?: number;
  currency?: string;
};

function money(minor: number | undefined, currency?: string) {
  if (minor == null) return null;
  return `${(minor / 100).toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

export function GuestActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    apiGet<{ items: ActivityItem[] }>("/guest/activity")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load activity"));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["all", ...[...set].sort()];
  }, [items]);

  const visible = filter === "all" ? items : items.filter((i) => i.category === filter);

  return (
    <section className="page">
      <h2>Activity</h2>
      <p className="muted">Your bookings, tickets, payments, invoices, and receipts in one place.</p>
      {error && <p className="error">{error}</p>}
      <div className="chip-row" role="tablist" aria-label="Activity filters">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={filter === c ? "btn" : "btn ghost"}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <ul className="list">
        {visible.map((item) => (
          <li key={`${item.category}:${item.id}`}>
            <Link to={item.href}>
              <strong>{item.title}</strong>
            </Link>
            <span className="muted">
              {" "}
              · {item.category} · {item.status}
              {money(item.amount, item.currency) ? ` · ${money(item.amount, item.currency)}` : ""}
              {" · "}
              {new Date(item.at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      {!visible.length && !error && <p className="muted">No activity yet.</p>}
      <p>
        <Link to="/receipts">Receipts</Link>
        {" · "}
        <Link to="/invoices">Invoices</Link>
        {" · "}
        <Link to="/payments">Payments</Link>
      </p>
    </section>
  );
}
