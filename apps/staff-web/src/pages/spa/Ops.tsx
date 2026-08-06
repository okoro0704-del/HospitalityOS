import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function SpaTreatmentsPage() {
  const [treatments, setTreatments] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      durationMinutes: number;
      price: number;
      offeringId: string | null;
      variants: Array<{ id: string; name: string; durationMinutes: number; price: number }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ treatments: typeof treatments }>("/spa/treatments");
    setTreatments(d.treatments);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/spa/treatments", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        description: fd.get("description") || undefined,
        durationMinutes: Number(fd.get("durationMinutes") || 60),
        price: Number(fd.get("price") || 0),
        requiredRoomTypes: String(fd.get("requiredRoomTypes") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        requiredSpecialties: String(fd.get("requiredSpecialties") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onVariant(e: FormEvent, treatmentId: string) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend(`/spa/treatments/${treatmentId}/variants`, "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        durationMinutes: Number(fd.get("durationMinutes")),
        price: Number(fd.get("price") || 0),
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
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Treatments</h2>
          <p className="muted">Catalog via Commerce Engine — no separate pricing.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="description" placeholder="Description" />
        <input name="durationMinutes" type="number" defaultValue={60} />
        <input name="price" type="number" step="0.01" defaultValue={90} />
        <input name="requiredRoomTypes" placeholder="Room types (comma)" />
        <input name="requiredSpecialties" placeholder="Specialties (comma)" />
        <button type="submit" className="btn">
          Create treatment
        </button>
      </form>
      <ul className="list">
        {treatments.map((t) => (
          <li key={t.id}>
            <strong>{t.name}</strong> · {t.durationMinutes}m · {t.price.toFixed(2)}
            {t.offeringId ? <span className="muted small"> · commerce</span> : null}
            <ul>
              {t.variants.map((v) => (
                <li key={v.id}>
                  {v.name} · {v.durationMinutes}m · {v.price.toFixed(2)}
                </li>
              ))}
            </ul>
            <form className="stack" onSubmit={(e) => onVariant(e, t.id)}>
              <input name="name" placeholder="Variant name" required />
              <input name="code" placeholder="Code" required />
              <input name="durationMinutes" type="number" defaultValue={90} required />
              <input name="price" type="number" step="0.01" defaultValue={130} />
              <button type="submit" className="btn ghost">
                Add variant
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaTherapistsPage() {
  const [therapists, setTherapists] = useState<
    Array<{
      id: string;
      displayName: string;
      email: string | null;
      specialties: Array<{ name: string; code: string }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ therapists: typeof therapists }>("/spa/therapists");
    setTherapists(d.therapists);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const code = String(fd.get("specialtyCode") || "massage");
    try {
      await apiSend("/spa/therapists", "POST", {
        displayName: fd.get("displayName"),
        email: fd.get("email") || undefined,
        bio: fd.get("bio") || undefined,
        specialties: [{ name: String(fd.get("specialtyName") || "Massage"), code }],
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
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Therapists</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <input name="displayName" placeholder="Display name" required />
        <input name="email" type="email" placeholder="Email" />
        <input name="bio" placeholder="Bio" />
        <input name="specialtyName" placeholder="Specialty name" defaultValue="Massage" />
        <input name="specialtyCode" placeholder="Specialty code" defaultValue="massage" />
        <button type="submit" className="btn">
          Add therapist
        </button>
      </form>
      <ul className="list">
        {therapists.map((t) => (
          <li key={t.id}>
            <strong>{t.displayName}</strong>
            {t.email ? ` · ${t.email}` : ""}
            {t.specialties.length ? ` · ${t.specialties.map((s) => s.name).join(", ")}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaAppointmentsPage() {
  const [appointments, setAppointments] = useState<
    Array<{
      id: string;
      startsAt: string;
      status: string;
      treatment: { name: string };
      therapist: { displayName: string } | null;
      room: { name: string } | null;
    }>
  >([]);
  const [treatments, setTreatments] = useState<Array<{ id: string; name: string }>>([]);
  const [therapists, setTherapists] = useState<Array<{ id: string; displayName: string }>>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [a, t, th, r, c] = await Promise.all([
      apiGet<{ appointments: typeof appointments }>("/spa/appointments"),
      apiGet<{ treatments: typeof treatments }>("/spa/treatments"),
      apiGet<{ therapists: typeof therapists }>("/spa/therapists"),
      apiGet<{ rooms: typeof rooms }>("/spa/rooms"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setAppointments(a.appointments);
    setTreatments(t.treatments);
    setTherapists(th.therapists);
    setRooms(r.rooms);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/spa/appointments", "POST", {
        customerId: fd.get("customerId"),
        treatmentId: fd.get("treatmentId"),
        therapistId: fd.get("therapistId") || undefined,
        roomId: fd.get("roomId") || undefined,
        startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
        notes: fd.get("notes") || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function cancel(id: string) {
    await apiSend(`/spa/appointments/${id}/cancel`, "POST", {});
    await load();
  }

  async function complete(id: string) {
    await apiSend(`/spa/appointments/${id}/complete`, "POST", {
      aftercareInstructions: "Hydrate and rest. Avoid intense heat for 24 hours.",
      generalNotes: "Session completed as planned.",
    });
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Appointments</h2>
          <p className="muted">Booked through the Booking Engine.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Client
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <select name="treatmentId" required defaultValue="">
          <option value="" disabled>
            Treatment
          </option>
          {treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="therapistId" defaultValue="">
          <option value="">Therapist (optional)</option>
          {therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
        <select name="roomId" defaultValue="">
          <option value="">Room (optional)</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <input name="notes" placeholder="Notes" />
        <button type="submit" className="btn">
          Book
        </button>
      </form>
      <ul className="timeline">
        {appointments.map((a) => (
          <li key={a.id}>
            <strong>{a.treatment.name}</strong> · {new Date(a.startsAt).toLocaleString()} · {a.status}
            {a.therapist ? ` · ${a.therapist.displayName}` : ""}
            {a.room ? ` · ${a.room.name}` : ""}
            <button type="button" className="btn ghost" onClick={() => cancel(a.id)}>
              Cancel
            </button>
            <button type="button" className="btn ghost" onClick={() => complete(a.id)}>
              Complete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaCalendarPage() {
  const [appointments, setAppointments] = useState<
    Array<{ id: string; startsAt: string; endsAt: string; status: string; treatment: { name: string } }>
  >([]);
  useEffect(() => {
    apiGet<{ appointments: typeof appointments }>("/spa/appointments").then((d) =>
      setAppointments(d.appointments),
    );
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Calendar</h2>
        </div>
      </header>
      <ul className="timeline">
        {appointments.map((a) => (
          <li key={a.id}>
            {new Date(a.startsAt).toLocaleString()} – {new Date(a.endsAt).toLocaleTimeString()} ·{" "}
            {a.treatment.name} · {a.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaClientsPage() {
  const [clients, setClients] = useState<
    Array<{ id: string; displayName: string; customerId: string; allergies: string | null }>
  >([]);
  useEffect(() => {
    apiGet<{ clients: typeof clients }>("/spa/clients").then((d) => setClients(d.clients));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Clients</h2>
        </div>
      </header>
      <ul className="list">
        {clients.map((c) => (
          <li key={c.id}>
            <strong>{c.displayName}</strong>
            {c.allergies ? <span className="muted small"> · allergies on file</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaConsultationsPage() {
  const [rows, setRows] = useState<
    Array<{ id: string; customerId: string; notes: string | null; recommendations: string | null; consultedAt: string }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [c, cust] = await Promise.all([
      apiGet<{ consultations: typeof rows }>("/spa/consultations"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setRows(c.consultations);
    setCustomers(cust.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/spa/consultations", "POST", {
        customerId: fd.get("customerId"),
        notes: fd.get("notes") || undefined,
        recommendations: fd.get("recommendations") || undefined,
        followUpAt: fd.get("followUpAt")
          ? new Date(String(fd.get("followUpAt"))).toISOString()
          : undefined,
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
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Consultations</h2>
          <p className="muted">Restricted to authorized spa roles. Not medical records.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Client
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <textarea name="notes" placeholder="General notes" />
        <textarea name="recommendations" placeholder="Recommendations" />
        <input name="followUpAt" type="date" />
        <button type="submit" className="btn">
          Record consultation
        </button>
      </form>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}>
            {new Date(r.consultedAt).toLocaleString()}
            {r.recommendations ? ` · ${r.recommendations}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaNotesPage() {
  const [notes, setNotes] = useState<
    Array<{ id: string; completionStatus: string; generalNotes: string | null; createdAt: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ notes: typeof notes }>("/spa/treatment-notes")
      .then((d) => setNotes(d.notes))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Treatment notes</h2>
          <p className="muted">Staff-only sensitive records.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {notes.map((n) => (
          <li key={n.id}>
            {n.completionStatus} · {new Date(n.createdAt).toLocaleString()}
            {n.generalNotes ? ` · ${n.generalNotes}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaWellnessPage() {
  const [sessions, setSessions] = useState<
    Array<{ id: string; startsAt: string; status: string; area: { name: string } }>
  >([]);
  const [facilities, setFacilities] = useState<
    Array<{ id: string; areas: Array<{ id: string; name: string }> }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [s, f, c] = await Promise.all([
      apiGet<{ sessions: typeof sessions }>("/spa/facilities/sessions"),
      apiGet<{ facilities: typeof facilities }>("/spa/facilities"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setSessions(s.sessions);
    setFacilities(f.facilities);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  const areas = facilities.flatMap((f) => f.areas);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const startsAt = new Date(String(fd.get("startsAt")));
    const endsAt = new Date(startsAt.getTime() + Number(fd.get("minutes") || 60) * 60000);
    try {
      await apiSend("/spa/facilities/sessions", "POST", {
        areaId: fd.get("areaId"),
        customerId: fd.get("customerId"),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        partySize: Number(fd.get("partySize") || 1),
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
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Wellness facilities</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="areaId" required defaultValue="">
          <option value="" disabled>
            Area
          </option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Guest
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <input name="minutes" type="number" defaultValue={60} />
        <input name="partySize" type="number" defaultValue={1} />
        <button type="submit" className="btn">
          Reserve
        </button>
      </form>
      <ul className="list">
        {sessions.map((s) => (
          <li key={s.id}>
            {s.area.name} · {new Date(s.startsAt).toLocaleString()} · {s.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaPackagesPage() {
  const [packages, setPackages] = useState<
    Array<{ id: string; name: string; price: number; offeringId: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ packages: typeof packages }>("/spa/packages");
    setPackages(d.packages);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/spa/packages", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        description: fd.get("description") || undefined,
        price: Number(fd.get("price") || 0),
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
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Packages</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="description" placeholder="Description" />
        <input name="price" type="number" step="0.01" defaultValue={160} />
        <button type="submit" className="btn">
          Create package
        </button>
      </form>
      <ul className="list">
        {packages.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> · {p.price.toFixed(2)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaMembershipsPage() {
  const [plans, setPlans] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [memberships, setMemberships] = useState<
    Array<{ id: string; status: string; plan: { name: string }; customerId: string }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [m, c] = await Promise.all([
      apiGet<{ plans: typeof plans; memberships: typeof memberships }>("/spa/memberships"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setPlans(m.plans);
    setMemberships(m.memberships);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onPlan(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/spa/memberships/plans", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        durationDays: Number(fd.get("durationDays") || 30),
        price: Number(fd.get("price") || 0),
      });
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onActivate(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await apiSend("/spa/memberships", "POST", {
        planId: fd.get("planId"),
        customerId: fd.get("customerId"),
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
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Memberships</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onPlan}>
        <h3>New plan</h3>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="durationDays" type="number" defaultValue={30} />
        <input name="price" type="number" step="0.01" defaultValue={120} />
        <button type="submit" className="btn">
          Create plan
        </button>
      </form>
      <form className="stack" onSubmit={onActivate}>
        <h3>Activate</h3>
        <select name="planId" required defaultValue="">
          <option value="" disabled>
            Plan
          </option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Client
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Activate
        </button>
      </form>
      <ul className="list">
        {memberships.map((m) => (
          <li key={m.id}>
            {m.plan.name} · {m.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaWaitlistPage() {
  const [entries, setEntries] = useState<
    Array<{ id: string; customerId: string; startsAt: string; status: string }>
  >([]);
  useEffect(() => {
    apiGet<{ entries: typeof entries }>("/spa/waitlist").then((d) => setEntries(d.entries));
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Waitlist</h2>
          <p className="muted">Booking Engine waitlist for spa_services.</p>
        </div>
      </header>
      <ul className="list">
        {entries.map((e) => (
          <li key={e.id}>
            {e.status} · {new Date(e.startsAt).toLocaleString()}
          </li>
        ))}
      </ul>
      {entries.length === 0 && <p className="muted">No waitlist entries.</p>}
    </section>
  );
}

export function SpaRoomsPage() {
  const [rooms, setRooms] = useState<
    Array<{ id: string; name: string; roomType: string; status: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ rooms: typeof rooms }>("/spa/rooms");
    setRooms(d.rooms);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function setStatus(id: string, status: string) {
    await apiSend(`/spa/rooms/${id}/status`, "PATCH", { status });
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Spa & Wellness</p>
          <h2>Treatment rooms</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {rooms.map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong> · {r.roomType} · {r.status}
            <button type="button" className="btn ghost" onClick={() => setStatus(r.id, "available")}>
              Available
            </button>
            <button type="button" className="btn ghost" onClick={() => setStatus(r.id, "maintenance")}>
              Maintenance
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
