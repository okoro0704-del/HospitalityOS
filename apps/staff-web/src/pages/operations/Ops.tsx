import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function OpsStockPage() {
  const [balances, setBalances] = useState<
    Array<{
      id: string;
      onHand: number;
      available: number;
      item: { id: string; name: string };
      location: { id: string; name: string };
    }>
  >([]);
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [b, i, l] = await Promise.all([
      apiGet<{ balances: typeof balances }>("/operations/stock"),
      apiGet<{ items: typeof items }>("/operations/items"),
      apiGet<{ locations: typeof locations }>("/operations/locations"),
    ]);
    setBalances(b.balances);
    setItems(i.items);
    setLocations(l.locations);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onTx(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/transactions", "POST", {
        itemId: fd.get("itemId"),
        locationId: fd.get("locationId"),
        type: fd.get("type"),
        quantity: Number(fd.get("quantity")),
        direction: fd.get("direction") || undefined,
        reason: fd.get("reason") || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Stock</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onTx}>
        <h3>Post transaction</h3>
        <select name="itemId" required>
          <option value="">Item</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select name="locationId" required>
          <option value="">Location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue="receipt">
          <option value="receipt">Receipt</option>
          <option value="consumption">Consumption</option>
          <option value="adjustment">Adjustment</option>
          <option value="damage">Damage</option>
          <option value="waste">Waste</option>
        </select>
        <select name="direction" defaultValue="in">
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <input name="quantity" type="number" step="0.01" defaultValue={1} required />
        <input name="reason" placeholder="Reason" />
        <button type="submit">Post</button>
      </form>
      <ul className="list">
        {balances.map((b) => (
          <li key={b.id}>
            {b.item.name} @ {b.location.name}: {b.available} available / {b.onHand} on hand
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsTransfersPage() {
  const [movements, setMovements] = useState<
    Array<{ id: string; quantity: number; fromLocationId: string; toLocationId: string; itemId: string }>
  >([]);
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [m, i, l] = await Promise.all([
      apiGet<{ movements: typeof movements }>("/operations/movements"),
      apiGet<{ items: typeof items }>("/operations/items"),
      apiGet<{ locations: typeof locations }>("/operations/locations"),
    ]);
    setMovements(m.movements);
    setItems(i.items);
    setLocations(l.locations);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/movements", "POST", {
        itemId: fd.get("itemId"),
        fromLocationId: fd.get("fromLocationId"),
        toLocationId: fd.get("toLocationId"),
        quantity: Number(fd.get("quantity")),
        reason: fd.get("reason") || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Transfers</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <select name="itemId" required>
          <option value="">Item</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select name="fromLocationId" required>
          <option value="">From</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select name="toLocationId" required>
          <option value="">To</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input name="quantity" type="number" defaultValue={1} required />
        <input name="reason" placeholder="Reason" />
        <button type="submit">Transfer</button>
      </form>
      <ul className="list">
        {movements.map((m) => (
          <li key={m.id}>
            Item {m.itemId.slice(-6)} · qty {m.quantity} · {m.fromLocationId.slice(-6)} → {m.toLocationId.slice(-6)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsCountsPage() {
  const [counts, setCounts] = useState<
    Array<{
      id: string;
      name: string;
      status: string;
      locationId: string;
      items: Array<{ id: string; itemId: string; expectedQty: number; actualQty: number | null }>;
    }>
  >([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [c, l] = await Promise.all([
      apiGet<{ counts: typeof counts }>("/operations/counts"),
      apiGet<{ locations: typeof locations }>("/operations/locations"),
    ]);
    setCounts(c.counts);
    setLocations(l.locations);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onStart(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/counts", "POST", {
        locationId: fd.get("locationId"),
        name: fd.get("name"),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function submit(id: string) {
    await apiSend(`/operations/counts/${id}/submit`, "POST", {});
    await load();
  }
  return (
    <section className="page">
      <h2>Stock counts</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onStart}>
        <select name="locationId" required>
          <option value="">Location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Count name" required />
        <button type="submit">Start count</button>
      </form>
      <ul className="list">
        {counts.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong> · {c.status} · {c.items.length} lines
            {c.status !== "submitted" && (
              <button type="button" className="btn ghost" onClick={() => submit(c.id)}>
                Submit
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsAlertsPage() {
  const [alerts, setAlerts] = useState<
    Array<{ id: string; itemId: string; onHand: number; reorderPoint: number; status: string }>
  >([]);
  useEffect(() => {
    apiGet<{ alerts: typeof alerts }>("/operations/reorder-alerts").then((d) => setAlerts(d.alerts));
  }, []);
  return (
    <section className="page">
      <h2>Reorder alerts</h2>
      <ul className="list">
        {alerts.map((a) => (
          <li key={a.id}>
            Item {a.itemId.slice(-6)} · on hand {a.onHand} ≤ {a.reorderPoint} · {a.status}
          </li>
        ))}
      </ul>
      {alerts.length === 0 && <p className="muted">No open alerts.</p>}
    </section>
  );
}

export function OpsSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string; code: string; email: string | null }>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ suppliers: typeof suppliers }>("/operations/suppliers");
    setSuppliers(d.suppliers);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/suppliers", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        email: fd.get("email") || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Suppliers</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="email" placeholder="Email" />
        <button type="submit">Add supplier</button>
      </form>
      <ul className="list">
        {suppliers.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong> ({s.code}) · {s.email ?? "—"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsPurchaseRequestsPage() {
  const [requests, setRequests] = useState<
    Array<{ id: string; status: string; notes: string | null; items: Array<{ quantity: number; itemId: string }> }>
  >([]);
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [r, i] = await Promise.all([
      apiGet<{ requests: typeof requests }>("/operations/purchase-requests"),
      apiGet<{ items: typeof items }>("/operations/items"),
    ]);
    setRequests(r.requests);
    setItems(i.items);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/purchase-requests", "POST", {
        notes: fd.get("notes") || undefined,
        items: [{ itemId: String(fd.get("itemId")), quantity: Number(fd.get("quantity") || 1) }],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function setStatus(id: string, status: string) {
    await apiSend(`/operations/purchase-requests/${id}/status`, "PATCH", { status });
    await load();
  }
  return (
    <section className="page">
      <h2>Purchase requests</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <select name="itemId" required>
          <option value="">Item</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input name="quantity" type="number" defaultValue={10} />
        <input name="notes" placeholder="Notes" />
        <button type="submit">Create draft</button>
      </form>
      <ul className="list">
        {requests.map((r) => (
          <li key={r.id}>
            #{r.id.slice(-6)} · {r.status} · {r.items.length} lines
            {r.status === "draft" && (
              <button type="button" onClick={() => setStatus(r.id, "submitted")}>
                Submit
              </button>
            )}
            {r.status === "submitted" && (
              <button type="button" onClick={() => setStatus(r.id, "approved")}>
                Approve
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsAssetsPage() {
  const [assets, setAssets] = useState<
    Array<{ id: string; name: string; code: string; status: string; serialNumber: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ assets: typeof assets }>("/operations/assets");
    setAssets(d.assets);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/assets", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        serialNumber: fd.get("serialNumber") || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <section className="page">
      <h2>Assets</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="serialNumber" placeholder="Serial" />
        <button type="submit">Register asset</button>
      </form>
      <ul className="list">
        {assets.map((a) => (
          <li key={a.id}>
            <strong>{a.name}</strong> ({a.code}) · {a.status} · {a.serialNumber ?? "—"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsMaintenancePage() {
  const [records, setRecords] = useState<
    Array<{ id: string; issue: string; status: string; priority: string; asset: { name: string } }>
  >([]);
  const [assets, setAssets] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [r, a] = await Promise.all([
      apiGet<{ records: typeof records }>("/operations/maintenance"),
      apiGet<{ assets: typeof assets }>("/operations/assets"),
    ]);
    setRecords(r.records);
    setAssets(a.assets);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/maintenance", "POST", {
        assetId: fd.get("assetId"),
        issue: fd.get("issue"),
        priority: fd.get("priority") || "medium",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function resolve(id: string) {
    await apiSend(`/operations/maintenance/${id}/status`, "PATCH", { status: "resolved" });
    await load();
  }
  return (
    <section className="page">
      <h2>Maintenance</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <select name="assetId" required>
          <option value="">Asset</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input name="issue" placeholder="Issue" required />
        <select name="priority" defaultValue="medium">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button type="submit">Open ticket</button>
      </form>
      <ul className="list">
        {records.map((r) => (
          <li key={r.id}>
            {r.asset.name} · {r.issue} · {r.priority} · {r.status}
            {r.status !== "resolved" && r.status !== "closed" && (
              <button type="button" onClick={() => resolve(r.id)}>
                Resolve
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OpsTasksPage() {
  const [tasks, setTasks] = useState<
    Array<{ id: string; title: string; status: string; priority: string; description: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ tasks: typeof tasks }>("/operations/tasks");
    setTasks(d.tasks);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/operations/tasks", "POST", {
        title: fd.get("title"),
        description: fd.get("description") || undefined,
        priority: fd.get("priority") || "medium",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  async function complete(id: string) {
    await apiSend(`/operations/tasks/${id}/status`, "PATCH", { status: "completed" });
    await load();
  }
  return (
    <section className="page">
      <h2>Operational tasks</h2>
      {error && <p className="error">{error}</p>}
      <form className="card-form" onSubmit={onSubmit}>
        <input name="title" placeholder="Title" required />
        <input name="description" placeholder="Description" />
        <select name="priority" defaultValue="medium">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button type="submit">Create task</button>
      </form>
      <ul className="list">
        {tasks.map((t) => (
          <li key={t.id}>
            <strong>{t.title}</strong> · {t.priority} · {t.status}
            {t.status !== "completed" && t.status !== "cancelled" && (
              <button type="button" onClick={() => complete(t.id)}>
                Complete
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
