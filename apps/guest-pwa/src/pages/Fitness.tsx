import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type HomeData = {
  profile: { displayName: string; customerId: string } | null;
  membership: {
    status: string;
    endsAt: string | null;
    plan: { name: string; benefits: Array<{ name: string }> };
  } | null;
  upcomingClasses: Array<{
    id: string;
    session: { startsAt: string; fitnessClass: { name: string } };
  }>;
  upcomingTraining: Array<{
    id: string;
    startsAt: string;
    trainer: { displayName: string };
  }>;
  attendance: Array<{ id: string; kind: string; status: string; recordedAt: string }>;
};

export function FitnessHomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<HomeData>("/guest/fitness/home")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCheckIn() {
    try {
      await apiSend("/guest/fitness/check-in", "POST", { kind: "gym" });
      setMessage("Checked in");
      const fresh = await apiGet<HomeData>("/guest/fitness/home");
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <section className="panel">
      <h2>Fitness</h2>
      <p className="muted">Membership, classes, training, and check-in.</p>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <div className="btn-row" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <Link className="btn" to="/fitness/classes">
          Classes
        </Link>
        <Link className="btn ghost" to="/fitness/trainers">
          Personal training
        </Link>
        <Link className="btn ghost" to="/fitness/membership">
          My membership
        </Link>
        <Link className="btn ghost" to="/fitness/passes">
          Passes
        </Link>
        <button type="button" className="btn ghost" onClick={onCheckIn}>
          Check in
        </button>
      </div>
      {data?.membership && (
        <article style={{ marginTop: "1rem" }}>
          <h3>{data.membership.plan.name}</h3>
          <p>
            Status: {data.membership.status}
            {data.membership.endsAt
              ? ` · expires ${new Date(data.membership.endsAt).toLocaleDateString()}`
              : ""}
          </p>
        </article>
      )}
      {data?.upcomingClasses && data.upcomingClasses.length > 0 && (
        <>
          <h3>Upcoming classes</h3>
          <ul className="timeline">
            {data.upcomingClasses.map((b) => (
              <li key={b.id}>
                {b.session.fitnessClass.name} · {new Date(b.session.startsAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
      {data?.upcomingTraining && data.upcomingTraining.length > 0 && (
        <>
          <h3>Upcoming training</h3>
          <ul className="timeline">
            {data.upcomingTraining.map((t) => (
              <li key={t.id}>
                {t.trainer.displayName} · {new Date(t.startsAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
      {data?.attendance && data.attendance.length > 0 && (
        <>
          <h3>Attendance</h3>
          <ul className="timeline">
            {data.attendance.slice(0, 8).map((a) => (
              <li key={a.id}>
                {a.kind} · {a.status} · {new Date(a.recordedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function FitnessMembershipPage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [plans, setPlans] = useState<
    Array<{ id: string; name: string; price: number; durationDays: number; description: string | null }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<HomeData>("/guest/fitness/home"),
      apiGet<{ plans: typeof plans }>("/guest/fitness/plans"),
    ])
      .then(([h, p]) => {
        setData(h);
        setPlans(p.plans);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="panel">
      <h2>My membership</h2>
      <Link to="/fitness">← Fitness home</Link>
      {error && <p className="error">{error}</p>}
      {data?.membership ? (
        <article style={{ marginTop: "1rem" }}>
          <h3>{data.membership.plan.name}</h3>
          <p>Status: {data.membership.status}</p>
          {data.membership.endsAt && (
            <p>Expires: {new Date(data.membership.endsAt).toLocaleDateString()}</p>
          )}
          {data.membership.plan.benefits?.length > 0 && (
            <>
              <h4>Benefits</h4>
              <ul>
                {data.membership.plan.benefits.map((b) => (
                  <li key={b.name}>{b.name}</li>
                ))}
              </ul>
            </>
          )}
        </article>
      ) : (
        <p className="muted">No active membership. Browse plans below — staff can activate for you.</p>
      )}
      <h3>Available plans</h3>
      <ul className="list">
        {plans.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> · {p.durationDays}d · {p.price.toFixed(2)}
            {p.description ? <span className="muted small"> · {p.description}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessClassesPage() {
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      startsAt: string;
      capacity: number;
      fitnessClass: { name: string; durationMinutes: number };
      trainer: { displayName: string } | null;
    }>
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ sessions: typeof sessions }>("/guest/fitness/sessions")
      .then((d) => setSessions(d.sessions))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function book(id: string) {
    try {
      await apiSend(`/guest/fitness/sessions/${id}/book`, "POST", {});
      setMessage("Class booked");
      setError(null);
    } catch (e) {
      const err = e as Error & { waitlistEntry?: unknown };
      if (String(err.message).includes("waitlist") || (e as { code?: string }).code === "waitlisted") {
        setMessage("Added to waitlist");
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Failed");
      }
    }
  }

  return (
    <section className="panel">
      <h2>Class schedule</h2>
      <Link to="/fitness">← Fitness home</Link>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <ul className="timeline">
        {sessions.map((s) => (
          <li key={s.id}>
            <strong>{s.fitnessClass.name}</strong> · {new Date(s.startsAt).toLocaleString()}
            {s.trainer ? ` · ${s.trainer.displayName}` : ""} · {s.fitnessClass.durationMinutes}m
            <button type="button" className="btn" style={{ marginLeft: "0.5rem" }} onClick={() => book(s.id)}>
              Book
            </button>
          </li>
        ))}
      </ul>
      {sessions.length === 0 && <p className="muted">No upcoming sessions.</p>}
    </section>
  );
}

export function FitnessTrainersPage() {
  const [trainers, setTrainers] = useState<
    Array<{ id: string; displayName: string; specializations: string[]; bio: string | null }>
  >([]);
  const [trainerId, setTrainerId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ trainers: typeof trainers }>("/guest/fitness/trainers")
      .then((d) => {
        setTrainers(d.trainers);
        if (d.trainers[0]) setTrainerId(d.trainers[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + 60 * 60000);
    try {
      await apiSend("/guest/fitness/training-sessions", "POST", {
        trainerId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
      setMessage("Personal training booked");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="panel">
      <h2>Personal training</h2>
      <Link to="/fitness">← Fitness home</Link>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <ul className="list">
        {trainers.map((t) => (
          <li key={t.id}>
            <strong>{t.displayName}</strong>
            {t.specializations?.length ? ` · ${t.specializations.join(", ")}` : ""}
            {t.bio ? <p className="muted small">{t.bio}</p> : null}
          </li>
        ))}
      </ul>
      <form className="stack" onSubmit={onSubmit} style={{ marginTop: "1rem" }}>
        <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} required>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <button type="submit" className="btn">
          Book 60-minute session
        </button>
      </form>
    </section>
  );
}

export function FitnessPassesPage() {
  const [passes, setPasses] = useState<
    Array<{ id: string; kind: string; status: string; startsAt: string; expiresAt: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ passes: typeof passes }>("/guest/fitness/access-passes")
      .then((d) => setPasses(d.passes))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="panel">
      <h2>Guest / day passes</h2>
      <Link to="/fitness">← Fitness home</Link>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {passes.map((p) => (
          <li key={p.id}>
            {p.kind} · {p.status} · until {new Date(p.expiresAt).toLocaleString()}
          </li>
        ))}
      </ul>
      {passes.length === 0 && <p className="muted">No passes issued yet. Ask front desk for a day or guest pass.</p>}
    </section>
  );
}
