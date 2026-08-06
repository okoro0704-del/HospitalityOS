import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

export function SpaHomePage() {
  const [data, setData] = useState<{
    treatments: Array<{ id: string; name: string; price: number; durationMinutes: number }>;
    appointments: Array<{ id: string; startsAt: string; status: string; treatment: { name: string } }>;
    aftercare: Array<{ id: string; instructions: string }>;
    membership: { plan: { name: string }; endsAt: string | null } | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<NonNullable<typeof data>>("/guest/spa/home")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="panel">
      <h2>Spa & Wellness</h2>
      <p className="muted">Browse treatments, book therapists, and view aftercare.</p>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <Link className="btn" to="/spa/treatments">
          Treatments
        </Link>
        <Link className="btn ghost" to="/spa/therapists">
          Therapists
        </Link>
        <Link className="btn ghost" to="/spa/book">
          Book
        </Link>
        <Link className="btn ghost" to="/spa/my-appointments">
          My appointments
        </Link>
        <Link className="btn ghost" to="/spa/packages">
          Packages
        </Link>
        <Link className="btn ghost" to="/spa/memberships">
          Memberships
        </Link>
      </div>
      {data?.membership && (
        <p style={{ marginTop: "1rem" }}>
          Membership: {data.membership.plan.name}
          {data.membership.endsAt
            ? ` · until ${new Date(data.membership.endsAt).toLocaleDateString()}`
            : ""}
        </p>
      )}
      {data?.aftercare && data.aftercare.length > 0 && (
        <>
          <h3>Aftercare</h3>
          <ul className="timeline">
            {data.aftercare.map((a) => (
              <li key={a.id}>{a.instructions}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function SpaTreatmentsGuestPage() {
  const [treatments, setTreatments] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      durationMinutes: number;
      price: number;
      variants: Array<{ id: string; name: string; durationMinutes: number; price: number }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ treatments: typeof treatments }>("/guest/spa/treatments")
      .then((d) => setTreatments(d.treatments))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="panel">
      <h2>Treatments</h2>
      <Link to="/spa">← Spa home</Link>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {treatments.map((t) => (
          <li key={t.id}>
            <strong>{t.name}</strong> · {t.durationMinutes}m · {t.price.toFixed(2)}
            {t.description ? <p className="muted small">{t.description}</p> : null}
            {t.variants.map((v) => (
              <div key={v.id} className="muted small">
                Variant: {v.name} · {v.durationMinutes}m · {v.price.toFixed(2)}
              </div>
            ))}
            <Link className="btn ghost" to={`/spa/book?treatmentId=${t.id}`}>
              Book
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaTherapistsGuestPage() {
  const [therapists, setTherapists] = useState<
    Array<{ id: string; displayName: string; bio: string | null; specialties: Array<{ name: string }> }>
  >([]);
  useEffect(() => {
    apiGet<{ therapists: typeof therapists }>("/guest/spa/therapists").then((d) =>
      setTherapists(d.therapists),
    );
  }, []);
  return (
    <section className="panel">
      <h2>Therapists</h2>
      <Link to="/spa">← Spa home</Link>
      <ul className="list">
        {therapists.map((t) => (
          <li key={t.id}>
            <strong>{t.displayName}</strong>
            {t.specialties.length ? ` · ${t.specialties.map((s) => s.name).join(", ")}` : ""}
            {t.bio ? <p className="muted small">{t.bio}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaBookPage() {
  const [treatments, setTreatments] = useState<Array<{ id: string; name: string }>>([]);
  const [therapists, setTherapists] = useState<Array<{ id: string; displayName: string }>>([]);
  const [treatmentId, setTreatmentId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get("treatmentId");
    Promise.all([
      apiGet<{ treatments: typeof treatments }>("/guest/spa/treatments"),
      apiGet<{ therapists: typeof therapists }>("/guest/spa/therapists"),
    ]).then(([t, th]) => {
      setTreatments(t.treatments);
      setTherapists(th.therapists);
      setTreatmentId(pre || t.treatments[0]?.id || "");
      if (th.therapists[0]) setTherapistId(th.therapists[0].id);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/guest/spa/appointments", "POST", {
        treatmentId,
        therapistId: therapistId || undefined,
        startsAt: new Date(startsAt).toISOString(),
        joinWaitlistIfUnavailable: true,
      });
      setMessage("Appointment booked");
      setError(null);
    } catch (err) {
      const e2 = err as Error & { code?: string };
      if (e2.message?.includes("waitlist") || e2.code === "waitlisted") {
        setMessage("Added to waitlist");
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed");
      }
    }
  }

  return (
    <section className="panel">
      <h2>Book appointment</h2>
      <Link to="/spa">← Spa home</Link>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <form className="stack" onSubmit={onSubmit}>
        <select value={treatmentId} onChange={(e) => setTreatmentId(e.target.value)} required>
          {treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
          <option value="">Any / none</option>
          {therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <button type="submit" className="btn">
          Confirm booking
        </button>
      </form>
    </section>
  );
}

export function SpaMyAppointmentsPage() {
  const [appointments, setAppointments] = useState<
    Array<{
      id: string;
      startsAt: string;
      status: string;
      treatment: { name: string };
      therapist: { displayName: string } | null;
    }>
  >([]);
  const [aftercare, setAftercare] = useState<Array<{ id: string; instructions: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [a, ac] = await Promise.all([
      apiGet<{ appointments: typeof appointments }>("/guest/spa/appointments"),
      apiGet<{ aftercare: typeof aftercare }>("/guest/spa/aftercare"),
    ]);
    setAppointments(a.appointments);
    setAftercare(ac.aftercare);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function cancel(id: string) {
    await apiSend(`/guest/spa/appointments/${id}/cancel`, "POST", {});
    setMessage("Cancelled");
    await load();
  }

  return (
    <section className="panel">
      <h2>My appointments</h2>
      <Link to="/spa">← Spa home</Link>
      {message && <p className="success">{message}</p>}
      <ul className="timeline">
        {appointments.map((a) => (
          <li key={a.id}>
            {a.treatment.name} · {new Date(a.startsAt).toLocaleString()} · {a.status}
            {a.therapist ? ` · ${a.therapist.displayName}` : ""}
            {a.status === "confirmed" && (
              <button type="button" className="btn ghost" onClick={() => cancel(a.id)}>
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
      {aftercare.length > 0 && (
        <>
          <h3>Aftercare</h3>
          <ul className="timeline">
            {aftercare.map((a) => (
              <li key={a.id}>{a.instructions}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function SpaPackagesGuestPage() {
  const [packages, setPackages] = useState<
    Array<{ id: string; name: string; description: string | null; price: number }>
  >([]);
  useEffect(() => {
    apiGet<{ packages: typeof packages }>("/guest/spa/packages").then((d) => setPackages(d.packages));
  }, []);
  return (
    <section className="panel">
      <h2>Packages</h2>
      <Link to="/spa">← Spa home</Link>
      <ul className="list">
        {packages.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> · {p.price.toFixed(2)}
            {p.description ? <p className="muted small">{p.description}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpaMembershipsGuestPage() {
  const [plans, setPlans] = useState<Array<{ id: string; name: string; price: number; durationDays: number }>>([]);
  const [membership, setMembership] = useState<{
    status: string;
    plan: { name: string };
    endsAt: string | null;
  } | null>(null);
  useEffect(() => {
    apiGet<{ plans: typeof plans; membership: typeof membership }>("/guest/spa/memberships").then(
      (d) => {
        setPlans(d.plans);
        setMembership(d.membership);
      },
    );
  }, []);
  return (
    <section className="panel">
      <h2>Memberships</h2>
      <Link to="/spa">← Spa home</Link>
      {membership ? (
        <p>
          Active: {membership.plan.name}
          {membership.endsAt ? ` · until ${new Date(membership.endsAt).toLocaleDateString()}` : ""}
        </p>
      ) : (
        <p className="muted">No active spa membership. Ask reception to activate a plan.</p>
      )}
      <h3>Available plans</h3>
      <ul className="list">
        {plans.map((p) => (
          <li key={p.id}>
            {p.name} · {p.durationDays}d · {p.price.toFixed(2)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Simple calendar list of bookable treatments (guest). */
export function SpaCalendarGuestPage() {
  return (
    <section className="panel">
      <h2>Spa calendar</h2>
      <Link to="/spa">← Spa home</Link>
      <p className="muted">Pick a treatment and time on the booking screen.</p>
      <Link className="btn" to="/spa/book">
        Book a time
      </Link>
      <Link className="btn ghost" to="/spa/my-appointments" style={{ marginLeft: "0.5rem" }}>
        My appointments
      </Link>
    </section>
  );
}
