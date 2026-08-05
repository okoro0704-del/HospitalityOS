import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function DiningDashboardPage() {
  const [data, setData] = useState<{
    tables: Array<{ status: string; _count: number }>;
    upcomingReservations: number;
    openOrders: number;
    kitchenQueue: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/dining/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant</p>
          <h2>Dining dashboard</h2>
          <p className="muted">Live snapshot of tables, reservations, orders, and kitchen.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="stat-row">
          <article className="stat">
            <p className="muted">Upcoming reservations</p>
            <strong>{data.upcomingReservations}</strong>
          </article>
          <article className="stat">
            <p className="muted">Open orders</p>
            <strong>{data.openOrders}</strong>
          </article>
          <article className="stat">
            <p className="muted">Kitchen queue</p>
            <strong>{data.kitchenQueue}</strong>
          </article>
          <article className="stat">
            <p className="muted">Tables by status</p>
            <ul className="list">
              {data.tables.map((t) => (
                <li key={t.status}>
                  {t.status}: {t._count}
                </li>
              ))}
            </ul>
          </article>
        </div>
      )}
    </section>
  );
}

export function DiningTablesPage() {
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([]);
  const [tables, setTables] = useState<
    Array<{ id: string; name: string; code: string; capacity: number; status: string; diningAreaId: string }>
  >([]);
  const [areaId, setAreaId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [a, t] = await Promise.all([
      apiGet<{ areas: typeof areas }>("/dining/areas"),
      apiGet<{ tables: typeof tables }>("/dining/tables"),
    ]);
    setAreas(a.areas);
    setTables(t.tables);
    if (a.areas[0]) setAreaId(a.areas[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreateArea(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/dining/areas", "POST", {
        name: fd.get("areaName"),
        code: fd.get("areaCode"),
        areaType: fd.get("areaType") || "indoor",
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onCreateTable(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/dining/tables", "POST", {
        diningAreaId: areaId,
        name,
        code,
        capacity: Number(capacity),
      });
      setName("");
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function setStatus(id: string, status: string) {
    await apiSend(`/dining/tables/${id}/status`, "PATCH", { status });
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant</p>
          <h2>Tables</h2>
          <p className="muted">Tables sync to Booking Engine bookable resources.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreateArea}>
        <input name="areaName" placeholder="Area name" required />
        <input name="areaCode" placeholder="Area code" required />
        <select name="areaType" defaultValue="indoor">
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
          <option value="bar">Bar</option>
          <option value="lounge">Lounge</option>
          <option value="rooftop">Rooftop</option>
        </select>
        <button className="btn" type="submit">
          Add area
        </button>
      </form>
      <form className="inline-form wrap" onSubmit={onCreateTable}>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input placeholder="Table name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        <button className="btn" type="submit">
          Add table
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Capacity</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.code}</td>
                <td>{t.capacity}</td>
                <td>{t.status}</td>
                <td>
                  <select
                    value={t.status}
                    onChange={(e) => setStatus(t.id, e.target.value)}
                  >
                    {["available", "reserved", "occupied", "cleaning", "out_of_service"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
