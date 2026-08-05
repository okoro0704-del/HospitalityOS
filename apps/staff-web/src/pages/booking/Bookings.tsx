import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Resource = { id: string; name: string };
type Customer = { id: string; displayName: string };
type Booking = {
  id: string;
  confirmationCode: string;
  status: string;
  moduleId: string;
  startsAt: string;
  endsAt: string;
};

export function BookingBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [b, r, c] = await Promise.all([
      apiGet<{ bookings: Booking[] }>("/booking/bookings"),
      apiGet<{ resources: Resource[] }>("/booking/resources"),
      apiGet<{ customers: Customer[] }>("/customers"),
    ]);
    setBookings(b.bookings);
    setResources(r.resources);
    setCustomers(c.customers);
    if (r.resources[0]) setResourceId(r.resources[0].id);
    if (c.customers[0]) setCustomerId(c.customers[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiSend("/booking/bookings", "POST", {
        moduleId: "events",
        customerId: customerId || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        items: [{ resourceId }],
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function cancel(id: string) {
    await apiSend(`/booking/bookings/${id}/cancel`, "POST");
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Booking engine</p>
          <h2>Bookings</h2>
          <p className="muted">Universal lifecycle shared by every reservable module.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">No guest</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        <button className="btn" type="submit">
          Create booking
        </button>
      </form>
      <div className="stack-list">
        {bookings.map((b) => (
          <article key={b.id} className="panel soft">
            <div className="row-between">
              <strong>{b.confirmationCode}</strong>
              <span className="chip">{b.status}</span>
            </div>
            <p className="muted small">
              {b.moduleId} · {new Date(b.startsAt).toLocaleString()} →{" "}
              {new Date(b.endsAt).toLocaleString()}
            </p>
            {["draft", "pending", "confirmed", "waitlisted"].includes(b.status) && (
              <button type="button" className="btn ghost" onClick={() => cancel(b.id)}>
                Cancel
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
