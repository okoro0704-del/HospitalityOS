import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function EventsListPage() {
  const [events, setEvents] = useState<
    Array<{
      id: string;
      name: string;
      status: string;
      startsAt: string;
      capacity: number;
      soldCount: number;
      venue: { name: string } | null;
      ticketTypes: Array<{ id: string; name: string; capacity: number; soldCount: number }>;
    }>
  >([]);
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [e, v] = await Promise.all([
      apiGet<{ events: typeof events }>("/events"),
      apiGet<{ venues: typeof venues }>("/venues"),
    ]);
    setEvents(e.events);
    setVenues(v.venues);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/events", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        description: fd.get("description") || undefined,
        venueId: fd.get("venueId") || undefined,
        startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
        endsAt: new Date(String(fd.get("endsAt"))).toISOString(),
        capacity: Number(fd.get("capacity") || 100),
        seatingMode: fd.get("seatingMode") || "general_admission",
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function publish(id: string) {
    await apiSend(`/events/${id}/publish`, "POST", {});
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Events</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="description" placeholder="Description" />
        <select name="venueId" defaultValue="">
          <option value="">Venue (optional)</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <input name="endsAt" type="datetime-local" required />
        <input name="capacity" type="number" defaultValue={100} />
        <select name="seatingMode" defaultValue="general_admission">
          <option value="general_admission">General admission</option>
          <option value="assigned">Assigned seating</option>
        </select>
        <button type="submit" className="btn">
          Create draft
        </button>
      </form>
      <ul className="list">
        {events.map((ev) => (
          <li key={ev.id}>
            <strong>{ev.name}</strong> · {ev.status} · {ev.soldCount}/{ev.capacity}
            {ev.venue ? ` · ${ev.venue.name}` : ""} · {new Date(ev.startsAt).toLocaleString()}
            {ev.status === "draft" && (
              <button type="button" className="btn ghost" onClick={() => publish(ev.id)}>
                Publish
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsTicketsPage() {
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [ticketTypes, setTicketTypes] = useState<
    Array<{
      id: string;
      name: string;
      price: number;
      capacity: number;
      soldCount: number;
      offeringId: string | null;
      eventId: string;
    }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [e, t, c] = await Promise.all([
      apiGet<{ events: typeof events }>("/events"),
      apiGet<{ ticketTypes: typeof ticketTypes }>("/tickets/types"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setEvents(e.events);
    setTicketTypes(t.ticketTypes);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, []);

  async function onType(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/tickets/types", "POST", {
        eventId: fd.get("eventId"),
        name: fd.get("name"),
        code: fd.get("code"),
        price: Number(fd.get("price") || 0),
        capacity: Number(fd.get("capacity") || 50),
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onBook(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const typeId = String(fd.get("ticketTypeId"));
    const type = ticketTypes.find((t) => t.id === typeId);
    try {
      await apiSend("/tickets/book", "POST", {
        eventId: type?.eventId,
        ticketTypeId: typeId,
        customerId: fd.get("customerId") || undefined,
        holderName: fd.get("holderName") || undefined,
        joinWaitlistIfUnavailable: true,
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Tickets</h2>
          <p className="muted">Ticket types use the Commerce Engine.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onType}>
        <h3>New ticket type</h3>
        <select name="eventId" required defaultValue="">
          <option value="" disabled>
            Event
          </option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="price" type="number" step="0.01" defaultValue={49} />
        <input name="capacity" type="number" defaultValue={50} />
        <button type="submit" className="btn">
          Create type
        </button>
      </form>
      <form className="stack" onSubmit={onBook}>
        <h3>Book ticket</h3>
        <select name="ticketTypeId" required defaultValue="">
          <option value="" disabled>
            Ticket type
          </option>
          {ticketTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.soldCount}/{t.capacity} · {t.price.toFixed(2)}
            </option>
          ))}
        </select>
        <select name="customerId" defaultValue="">
          <option value="">Walk-in</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input name="holderName" placeholder="Holder name" />
        <button type="submit" className="btn">
          Book
        </button>
      </form>
      <ul className="list">
        {ticketTypes.map((t) => (
          <li key={t.id}>
            {t.name} · {t.soldCount}/{t.capacity} · {t.price.toFixed(2)}
            {t.offeringId ? <span className="muted small"> · commerce</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsCalendarPage() {
  const [events, setEvents] = useState<
    Array<{ id: string; name: string; startsAt: string; endsAt: string; status: string }>
  >([]);
  useEffect(() => {
    apiGet<{ events: typeof events }>("/events").then((d) => setEvents(d.events));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Calendar</h2>
        </div>
      </header>
      <ul className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            {new Date(e.startsAt).toLocaleString()} – {new Date(e.endsAt).toLocaleTimeString()} ·{" "}
            {e.name} · {e.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsAttendeesPage() {
  const [attendees, setAttendees] = useState<
    Array<{
      id: string;
      displayName: string;
      checkInStatus: string;
      ticket: { id: string; status: string };
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const d = await apiGet<{ attendees: typeof attendees }>("/attendees");
    setAttendees(d.attendees);
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  async function checkIn(ticketId: string) {
    await apiSend("/check-in", "POST", { ticketId });
    await load();
  }
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Attendees & check-in</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {attendees.map((a) => (
          <li key={a.id}>
            <strong>{a.displayName}</strong> · {a.checkInStatus} · ticket {a.ticket.status}
            {a.checkInStatus === "not_checked_in" && a.ticket.status !== "cancelled" && (
              <button type="button" className="btn ghost" onClick={() => checkIn(a.ticket.id)}>
                Check in
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsSeatingPage() {
  const [events, setEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [plan, setPlan] = useState<{
    name: string;
    sections: Array<{
      name: string;
      seats: Array<{ id: string; label: string; status: string }>;
    }>;
  } | null>(null);
  const [eventId, setEventId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ events: typeof events }>("/events").then((d) => {
      setEvents(d.events);
      if (d.events[0]) setEventId(d.events[0].id);
    });
  }, []);

  async function loadPlan(id: string) {
    try {
      const d = await apiGet<{ plan: typeof plan }>(`/seating/plans/${id}`);
      setPlan(d.plan);
    } catch {
      setPlan(null);
    }
  }

  useEffect(() => {
    if (eventId) loadPlan(eventId).catch(() => setPlan(null));
  }, [eventId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/seating/plans", "POST", {
        eventId,
        name: "Main Plan",
        sections: [
          {
            name: "VIP",
            code: "VIP",
            seats: [
              { label: "A1", rowLabel: "A" },
              { label: "A2", rowLabel: "A" },
            ],
          },
          {
            name: "General",
            code: "GA",
            seats: [
              { label: "B1", rowLabel: "B" },
              { label: "B2", rowLabel: "B" },
              { label: "B3", rowLabel: "B" },
            ],
          },
        ],
      });
      await loadPlan(eventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Seating</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
          </option>
        ))}
      </select>
      <form className="stack" onSubmit={onCreate}>
        <button type="submit" className="btn">
          Create sample seating plan
        </button>
      </form>
      {plan && (
        <ul className="list">
          {plan.sections.map((s) => (
            <li key={s.name}>
              <strong>{s.name}</strong>
              <ul>
                {s.seats.map((seat) => (
                  <li key={seat.id}>
                    {seat.label} · {seat.status}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EventsPackagesPage() {
  const [packages, setPackages] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [addons, setAddons] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [p, a] = await Promise.all([
      apiGet<{ packages: typeof packages }>("/events/packages"),
      apiGet<{ addons: typeof addons }>("/events/addons"),
    ]);
    setPackages(p.packages);
    setAddons(a.addons);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onPkg(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/events/packages", "POST", {
      name: fd.get("name"),
      code: fd.get("code"),
      price: Number(fd.get("price") || 0),
    });
    (e.target as HTMLFormElement).reset();
    await load();
  }

  async function onAddon(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    await apiSend("/events/addons", "POST", {
      name: fd.get("name"),
      code: fd.get("code"),
      price: Number(fd.get("price") || 0),
    });
    (e.target as HTMLFormElement).reset();
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Packages & add-ons</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onPkg}>
        <h3>Package</h3>
        <input name="name" required placeholder="Name" />
        <input name="code" required placeholder="Code" />
        <input name="price" type="number" defaultValue={2500} />
        <button type="submit" className="btn">
          Create package
        </button>
      </form>
      <form className="stack" onSubmit={onAddon}>
        <h3>Add-on</h3>
        <input name="name" required placeholder="Name" />
        <input name="code" required placeholder="Code" />
        <input name="price" type="number" defaultValue={350} />
        <button type="submit" className="btn">
          Create add-on
        </button>
      </form>
      <ul className="list">
        {packages.map((p) => (
          <li key={p.id}>
            Package: {p.name} · {p.price.toFixed(2)}
          </li>
        ))}
        {addons.map((a) => (
          <li key={a.id}>
            Add-on: {a.name} · {a.price.toFixed(2)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventsWaitlistPage() {
  const [entries, setEntries] = useState<
    Array<{ id: string; customerId: string; status: string; createdAt: string }>
  >([]);
  useEffect(() => {
    apiGet<{ entries: typeof entries }>("/waitlist").then((d) => setEntries(d.entries));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Waitlists</h2>
        </div>
      </header>
      <ul className="list">
        {entries.map((e) => (
          <li key={e.id}>
            {e.status} · {new Date(e.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
      {entries.length === 0 && <p className="muted">No waitlist entries.</p>}
    </section>
  );
}

export function EventsRentalsPage() {
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ venues: typeof venues }>("/venues"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]).then(([v, c]) => {
      setVenues(v.venues);
      setCustomers(c.customers);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/venues/rentals", "POST", {
        venueId: fd.get("venueId"),
        customerId: fd.get("customerId") || undefined,
        startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
        endsAt: new Date(String(fd.get("endsAt"))).toISOString(),
        partySize: Number(fd.get("partySize") || 1),
        notes: fd.get("notes") || undefined,
      });
      setMessage("Venue rental booked");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Events & Venues</p>
          <h2>Venue rental</h2>
          <p className="muted">Private rentals use the Booking Engine.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <form className="stack" onSubmit={onSubmit}>
        <select name="venueId" required defaultValue="">
          <option value="" disabled>
            Venue
          </option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select name="customerId" defaultValue="">
          <option value="">Client (optional)</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <input name="endsAt" type="datetime-local" required />
        <input name="partySize" type="number" defaultValue={50} />
        <input name="notes" placeholder="Notes" />
        <button type="submit" className="btn">
          Book rental
        </button>
      </form>
    </section>
  );
}
