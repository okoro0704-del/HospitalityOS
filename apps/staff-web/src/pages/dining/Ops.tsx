import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function DiningReservationsPage() {
  const [reservations, setReservations] = useState<
    Array<{
      id: string;
      confirmationCode: string;
      partySize: number;
      seatingAt: string;
      status: string;
      table?: { name: string } | null;
    }>
  >([]);
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([]);
  const [tables, setTables] = useState<Array<{ id: string; name: string }>>([]);
  const [areaId, setAreaId] = useState("");
  const [tableId, setTableId] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [seatingAt, setSeatingAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [r, a, t] = await Promise.all([
      apiGet<{ reservations: typeof reservations }>("/dining/reservations"),
      apiGet<{ areas: typeof areas }>("/dining/areas"),
      apiGet<{ tables: typeof tables }>("/dining/tables"),
    ]);
    setReservations(r.reservations);
    setAreas(a.areas);
    setTables(t.tables);
    if (a.areas[0]) setAreaId(a.areas[0].id);
    if (t.tables[0]) setTableId(t.tables[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/dining/reservations", "POST", {
        diningAreaId: areaId || undefined,
        tableId: tableId || undefined,
        partySize: Number(partySize),
        seatingAt: new Date(seatingAt).toISOString(),
        joinWaitlistIfUnavailable: true,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function cancel(id: string) {
    await apiSend(`/dining/reservations/${id}/cancel`, "POST");
    await load();
  }

  async function seat(id: string) {
    await apiSend(`/dining/reservations/${id}/seat`, "POST", {});
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant</p>
          <h2>Reservations</h2>
          <p className="muted">Powered by the Booking Engine — no duplicate reservation stack.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
          <option value="">Auto-assign</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input type="number" value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        <input
          type="datetime-local"
          value={seatingAt}
          onChange={(e) => setSeatingAt(e.target.value)}
          required
        />
        <button className="btn" type="submit">
          Reserve
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>When</th>
              <th>Party</th>
              <th>Table</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id}>
                <td>{r.confirmationCode}</td>
                <td>{new Date(r.seatingAt).toLocaleString()}</td>
                <td>{r.partySize}</td>
                <td>{r.table?.name ?? "—"}</td>
                <td>{r.status}</td>
                <td>
                  {["pending", "confirmed"].includes(r.status) && (
                    <>
                      <button type="button" className="btn ghost" onClick={() => seat(r.id)}>
                        Seat
                      </button>
                      <button type="button" className="btn ghost" onClick={() => cancel(r.id)}>
                        Cancel
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DiningMenusPage() {
  const [menus, setMenus] = useState<
    Array<{
      id: string;
      name: string;
      sections: Array<{
        id: string;
        name: string;
        items: Array<{ id: string; name: string; price: number }>;
      }>;
    }>
  >([]);
  const [menuName, setMenuName] = useState("");
  const [menuCode, setMenuCode] = useState("");
  const [sectionMenuId, setSectionMenuId] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionCode, setSectionCode] = useState("");
  const [itemSectionId, setItemSectionId] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [itemPrice, setItemPrice] = useState("12");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ menus: typeof menus }>("/dining/menus");
    setMenus(data.menus);
    if (data.menus[0]) setSectionMenuId(data.menus[0].id);
    const firstSection = data.menus[0]?.sections[0];
    if (firstSection) setItemSectionId(firstSection.id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onMenu(e: FormEvent) {
    e.preventDefault();
    await apiSend("/dining/menus", "POST", { name: menuName, code: menuCode, featured: true });
    setMenuName("");
    setMenuCode("");
    await load();
  }

  async function onSection(e: FormEvent) {
    e.preventDefault();
    await apiSend(`/dining/menus/${sectionMenuId}/sections`, "POST", {
      name: sectionName,
      code: sectionCode,
    });
    setSectionName("");
    setSectionCode("");
    await load();
  }

  async function onItem(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend(`/dining/sections/${itemSectionId}/items`, "POST", {
        name: itemName,
        code: itemCode,
        price: Number(itemPrice),
        asProduct: true,
      });
      setItemName("");
      setItemCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant</p>
          <h2>Menus</h2>
          <p className="muted">Menu items create Commerce offerings automatically.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onMenu}>
        <input placeholder="Menu name" value={menuName} onChange={(e) => setMenuName(e.target.value)} required />
        <input placeholder="Code" value={menuCode} onChange={(e) => setMenuCode(e.target.value)} required />
        <button className="btn" type="submit">
          Add menu
        </button>
      </form>
      <form className="inline-form wrap" onSubmit={onSection}>
        <select value={sectionMenuId} onChange={(e) => setSectionMenuId(e.target.value)}>
          {menus.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input placeholder="Section" value={sectionName} onChange={(e) => setSectionName(e.target.value)} required />
        <input placeholder="Code" value={sectionCode} onChange={(e) => setSectionCode(e.target.value)} required />
        <button className="btn" type="submit">
          Add section
        </button>
      </form>
      <form className="inline-form wrap" onSubmit={onItem}>
        <select value={itemSectionId} onChange={(e) => setItemSectionId(e.target.value)}>
          {menus.flatMap((m) =>
            m.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {m.name} / {s.name}
              </option>
            )),
          )}
        </select>
        <input placeholder="Item" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
        <input placeholder="Code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} required />
        <input type="number" step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
        <button className="btn" type="submit">
          Add item
        </button>
      </form>
      {menus.map((m) => (
        <article key={m.id} style={{ marginTop: "1.25rem" }}>
          <h3>{m.name}</h3>
          {m.sections.map((s) => (
            <div key={s.id}>
              <h4>{s.name}</h4>
              <ul className="list">
                {s.items.map((i) => (
                  <li key={i.id}>
                    {i.name} · {i.price.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

export function DiningOrdersPage() {
  const [orders, setOrders] = useState<
    Array<{ id: string; status: string; orderType: string; total: number; items: Array<{ name: string; quantity: number }> }>
  >([]);
  const [menuItems, setMenuItems] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [o, menus] = await Promise.all([
      apiGet<{ orders: typeof orders }>("/dining/orders"),
      apiGet<{
        menus: Array<{ sections: Array<{ items: Array<{ id: string; name: string; price: number }> }> }>;
      }>("/dining/menus"),
    ]);
    setOrders(o.orders);
    const items = menus.menus.flatMap((m) => m.sections.flatMap((s) => s.items));
    setMenuItems(items);
    if (items[0]) setItemId(items[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const mi = menuItems.find((i) => i.id === itemId);
    if (!mi) return;
    try {
      const created = await apiSend<{ order: { id: string } }>("/dining/orders", "POST", {
        orderType: "dine_in",
        items: [{ menuItemId: mi.id, name: mi.name, quantity: Number(qty), unitPrice: mi.price }],
      });
      await apiSend(`/dining/orders/${created.order.id}/transition`, "POST", { status: "submitted" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function transition(id: string, status: string) {
    await apiSend(`/dining/orders/${id}/transition`, "POST", { status });
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant</p>
          <h2>Orders</h2>
          <p className="muted">Dine-in, takeaway, delivery & room service foundations.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {menuItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        <button className="btn" type="submit">
          Create & submit
        </button>
      </form>
      <ul className="list">
        {orders.map((o) => (
          <li key={o.id}>
            {o.orderType} · {o.status} · {o.total.toFixed(2)} ·{" "}
            {o.items.map((i) => `${i.quantity}×${i.name}`).join(", ")}
            {o.status === "submitted" && (
              <button type="button" className="btn ghost" onClick={() => transition(o.id, "preparing")}>
                Preparing
              </button>
            )}
            {o.status === "preparing" && (
              <button type="button" className="btn ghost" onClick={() => transition(o.id, "ready")}>
                Ready
              </button>
            )}
            {o.status === "ready" && (
              <button type="button" className="btn ghost" onClick={() => transition(o.id, "served")}>
                Served
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DiningKitchenPage() {
  const [tickets, setTickets] = useState<
    Array<{
      id: string;
      status: string;
      priority: number;
      station?: { name: string } | null;
      order: { items: Array<{ name: string; quantity: number }> };
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ tickets: typeof tickets }>("/dining/kitchen/tickets");
    setTickets(data.tickets);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function setStatus(id: string, status: string) {
    await apiSend(`/dining/kitchen/tickets/${id}`, "PATCH", { status });
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant</p>
          <h2>Kitchen display</h2>
          <p className="muted">Station tickets — no hardware integrations yet.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="module-grid" style={{ display: "grid", gap: "0.75rem" }}>
        {tickets.map((t) => (
          <article key={t.id} className="stat">
            <p className="muted">
              {t.station?.name ?? "General"} · priority {t.priority}
            </p>
            <strong>{t.status}</strong>
            <ul className="list">
              {t.order.items.map((i, idx) => (
                <li key={idx}>
                  {i.quantity}× {i.name}
                </li>
              ))}
            </ul>
            {t.status === "queued" && (
              <button type="button" className="btn" onClick={() => setStatus(t.id, "preparing")}>
                Start
              </button>
            )}
            {t.status === "preparing" && (
              <button type="button" className="btn" onClick={() => setStatus(t.id, "ready")}>
                Mark ready
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function DiningShiftsPage() {
  const [shifts, setShifts] = useState<Array<{ id: string; name: string; code: string; startsAt: string; endsAt: string; status: string }>>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ shifts: typeof shifts }>("/dining/shifts");
    setShifts(data.shifts);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/dining/shifts", "POST", {
        name,
        code,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      setName("");
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant</p>
          <h2>Shifts</h2>
          <p className="muted">Dining staff shift windows.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        <button className="btn" type="submit">
          Add shift
        </button>
      </form>
      <ul className="list">
        {shifts.map((s) => (
          <li key={s.id}>
            {s.name} ({s.code}) · {new Date(s.startsAt).toLocaleString()} →{" "}
            {new Date(s.endsAt).toLocaleString()} · {s.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
