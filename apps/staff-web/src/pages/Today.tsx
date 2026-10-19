import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend, getSession } from "../lib/api";
import { BranchScopeBar, getSelectedBranchId } from "../components/BranchScope";

type TodayPayload = {
  today: {
    day: string;
    sections: Array<{
      id: string;
      title: string;
      ok: boolean;
      error?: string | null;
      items: Array<{
        id: string;
        kind: string;
        title: string;
        subtitle?: string | null;
        status?: string | null;
        href?: string | null;
        at?: string | null;
      }>;
      count: number;
    }>;
    attention: Array<{
      id: string;
      priority: string;
      title: string;
      reason: string;
      href?: string | null;
      source: string;
    }>;
    quickActions: Array<{ id: string; label: string; href: string }>;
    completed: {
      note: string;
      paymentsCapturedToday: number;
      tasksCompletedToday: number;
    };
  };
};

export function TodayPage() {
  const [data, setData] = useState<TodayPayload["today"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [commandLabel, setCommandLabel] = useState<string | null>(null);
  const [filterSections, setFilterSections] = useState<string[] | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ type: string; id: string; title: string; subtitle?: string; href: string }>
  >([]);
  const session = getSession();

  function load() {
    const branchId = getSelectedBranchId();
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    apiGet<TodayPayload>(`/operations/today${qs}`)
      .then((d) => setData(d.today))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load Today"));
  }

  useEffect(() => {
    load();
    const onBranch = () => load();
    window.addEventListener("hos-branch-change", onBranch);
    return () => window.removeEventListener("hos-branch-change", onBranch);
  }, []);

  const visibleSections = useMemo(() => {
    if (!data) return [];
    if (!filterSections?.length) return data.sections;
    return data.sections.filter((s) => filterSections.includes(s.id));
  }, [data, filterSections]);

  async function runCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim()) {
      setFilterSections(null);
      setCommandLabel(null);
      return;
    }
    try {
      const res = await apiSend<{
        command: { matched: boolean; sectionIds: string[]; label: string };
      }>("/operations/command", "POST", { query: command });
      if (res.command.matched) {
        setFilterSections(res.command.sectionIds);
        setCommandLabel(res.command.label);
      } else {
        setFilterSections(null);
        setCommandLabel(`No command match — showing all. Try search for “${command}”.`);
        setSearchQ(command);
        await runSearch(command);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
    }
  }

  async function runSearch(q = searchQ) {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const branchId = getSelectedBranchId();
    const qs = new URLSearchParams({ q: q.trim() });
    if (branchId) qs.set("branchId", branchId);
    const res = await apiGet<{ results: typeof searchResults }>(`/operations/search?${qs}`);
    setSearchResults(res.results);
  }

  if (error && !data) {
    return (
      <section className="page" aria-live="polite">
        <h2>Today</h2>
        <p className="error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="page" aria-busy="true">
        <h2>Today</h2>
        <p className="muted">Loading operational board…</p>
      </section>
    );
  }

  return (
    <section className="page today-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Today</h2>
          <p className="muted">
            {data.day} · {session?.displayName} · What is happening across the business
          </p>
        </div>
        <BranchScopeBar />
      </header>

      <form className="today-command" onSubmit={runCommand} role="search" aria-label="Staff command">
        <label className="sr-only" htmlFor="staff-command">
          Command or filter
        </label>
        <input
          id="staff-command"
          className="input"
          placeholder='Command: “Show today&apos;s arrivals”, “Low stock”, “Unpaid invoices”…'
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <button type="submit" className="btn">
          Run
        </button>
        {filterSections && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setFilterSections(null);
              setCommandLabel(null);
              setCommand("");
            }}
          >
            Clear filter
          </button>
        )}
      </form>
      {commandLabel && (
        <p className="muted small" aria-live="polite">
          {commandLabel}
        </p>
      )}

      <form
        className="today-search"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        role="search"
        aria-label="Operational search"
      >
        <label className="sr-only" htmlFor="ops-search">
          Search
        </label>
        <input
          id="ops-search"
          className="input"
          placeholder="Search customers, bookings, invoices…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        <button type="submit" className="btn ghost">
          Search
        </button>
      </form>
      {searchResults.length > 0 && (
        <div className="panel soft" aria-label="Search results">
          <h3>Search results</h3>
          <ul className="list">
            {searchResults.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <Link to={r.href}>
                  {r.type}: {r.title}
                </Link>
                {r.subtitle ? ` · ${r.subtitle}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.attention.length > 0 && (
        <section className="panel attention-board" aria-label="Needs attention">
          <h3>Needs attention</h3>
          <ul className="attention-list">
            {data.attention.map((a) => (
              <li key={a.id} className={`priority-${a.priority}`}>
                <span className={`badge badge-${a.priority}`}>{a.priority}</span>
                <div>
                  <strong>{a.title}</strong>
                  <p className="muted small">{a.reason}</p>
                </div>
                {a.href && (
                  <Link className="btn ghost" to={a.href}>
                    Open
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="quick-actions" aria-label="Quick actions">
        <h3>Quick actions</h3>
        <div className="chip-row">
          {data.quickActions.map((a) => (
            <Link key={a.id} className="btn" to={a.href}>
              {a.label}
            </Link>
          ))}
          {data.quickActions.length === 0 && (
            <p className="muted">No quick actions for your permissions.</p>
          )}
        </div>
      </section>

      <div className="stat-row" aria-label="Completed today">
        <article>
          <strong>{data.completed.paymentsCapturedToday}</strong>
          <span>Payments captured</span>
        </article>
        <article>
          <strong>{data.completed.tasksCompletedToday}</strong>
          <span>Tasks completed</span>
        </article>
      </div>
      <p className="muted small">{data.completed.note}</p>

      <div className="today-grid">
        {visibleSections.map((sec) => (
          <section key={sec.id} className="panel soft today-section" aria-labelledby={`sec-${sec.id}`}>
            <h3 id={`sec-${sec.id}`}>
              {sec.title} <span className="muted small">({sec.count})</span>
            </h3>
            {!sec.ok && (
              <p className="error" role="status">
                Section unavailable: {sec.error}
              </p>
            )}
            {sec.ok && sec.items.length === 0 && <p className="muted">Nothing for today.</p>}
            {sec.ok && sec.items.length > 0 && (
              <ul className="list">
                {sec.items.map((item) => (
                  <li key={item.id}>
                    {item.href ? <Link to={item.href}>{item.title}</Link> : item.title}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                    {item.status ? ` · ${item.status}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
