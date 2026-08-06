import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function OpsDashboardPage() {
  const [data, setData] = useState<{
    locations: number;
    items: number;
    lowStock: number;
    openTasks: number;
    openMaint: number;
    openAlerts: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/operations/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations & Inventory</p>
          <h2>Operations dashboard</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {data && (
        <div className="stat-row">
          <article className="stat">
            <p className="muted">Locations</p>
            <strong>{data.locations}</strong>
          </article>
          <article className="stat">
            <p className="muted">Items</p>
            <strong>{data.items}</strong>
          </article>
          <article className="stat">
            <p className="muted">Low stock</p>
            <strong>{data.lowStock}</strong>
          </article>
          <article className="stat">
            <p className="muted">Reorder alerts</p>
            <strong>{data.openAlerts}</strong>
          </article>
          <article className="stat">
            <p className="muted">Open tasks</p>
            <strong>{data.openTasks}</strong>
          </article>
          <article className="stat">
            <p className="muted">Maintenance</p>
            <strong>{data.openMaint}</strong>
          </article>
        </div>
      )}
    </section>
  );
}

export function OpsLocationsPage() {
  const [locations, setLocations] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      parentId: string | null;
      areas: Array<{ id: string; name: string }>;
      children: Array<{ id: string; name: string }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ locations: typeof locations }>("/operations/locations");
    setLocations(d.locations);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/locations", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        parentId: fd.get("parentId") || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Locations</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <select name="parentId">
          <option value="">No parent</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="submit">Create location</button>
      </form>
      <ul className="list">
        {locations.map((l) => (
          <li key={l.id}>
            <strong>{l.name}</strong> ({l.code})
            {l.children.length > 0 && (
              <div className="muted">Areas/children: {l.children.map((c) => c.name).join(", ")}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsInventoryPage() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      name: string;
      sku: string;
      unit: string;
      reorderPoint: number;
      balances: Array<{ onHand: number; available: number; location: { name: string } }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ items: typeof items }>("/operations/items");
    setItems(d.items);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/items", "POST", {
        name: fd.get("name"),
        sku: fd.get("sku"),
        unit: fd.get("unit") || "piece",
        reorderPoint: Number(fd.get("reorderPoint") || 0),
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Inventory items</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <input name="name" placeholder="Name" required />
        <input name="sku" placeholder="SKU" required />
        <select name="unit" defaultValue="piece">
          <option value="piece">Piece</option>
          <option value="box">Box</option>
          <option value="pack">Pack</option>
          <option value="litre">Litre</option>
          <option value="kilogram">Kilogram</option>
        </select>
        <input name="reorderPoint" type="number" placeholder="Reorder point" defaultValue={10} />
        <button type="submit">Add item</button>
      </form>
      <ul className="list">
        {items.map((i) => (
          <li key={i.id}>
            <strong>{i.name}</strong> · {i.sku} · {i.unit} · RP {i.reorderPoint}
            <div className="muted">
              {i.balances.map((b) => `${b.location.name}: ${b.available} avail / ${b.onHand} on hand`).join(" · ") ||
                "No stock"}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
