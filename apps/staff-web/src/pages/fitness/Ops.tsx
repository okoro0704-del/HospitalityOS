import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function FitnessPlansPage() {
  const [plans, setPlans] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      durationDays: number;
      price: number;
      status: string;
      offeringId: string | null;
      benefits: Array<{ name: string }>;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ plans: typeof plans }>("/fitness/plans");
    setPlans(d.plans);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/fitness/plans", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        description: fd.get("description") || undefined,
        durationDays: Number(fd.get("durationDays") || 30),
        price: Number(fd.get("price") || 0),
        guestPrivileges: fd.get("guestPrivileges") === "on",
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Membership plans</h2>
          <p className="muted">Plans are Commerce offerings — no separate pricing engine.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="description" placeholder="Description" />
        <input name="durationDays" type="number" defaultValue={30} />
        <input name="price" type="number" step="0.01" defaultValue={79} />
        <label>
          <input name="guestPrivileges" type="checkbox" /> Guest privileges
        </label>
        <button type="submit" className="btn">
          Create plan
        </button>
      </form>
      <ul className="list">
        {plans.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> · {p.durationDays}d · {p.price.toFixed(2)} · {p.status}
            {p.offeringId ? <span className="muted small"> · commerce {p.offeringId.slice(-6)}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessMembershipsPage() {
  const [memberships, setMemberships] = useState<
    Array<{
      id: string;
      status: string;
      customerId: string;
      plan: { name: string };
      endsAt: string | null;
    }>
  >([]);
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [m, p, c] = await Promise.all([
      apiGet<{ memberships: typeof memberships }>("/fitness/memberships"),
      apiGet<{ plans: typeof plans }>("/fitness/plans"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setMemberships(m.memberships);
    setPlans(p.plans);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/fitness/memberships", "POST", {
        planId: fd.get("planId"),
        customerId: fd.get("customerId"),
        activate: true,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function action(id: string, act: string) {
    await apiSend(`/fitness/memberships/${id}/${act}`, "POST", {});
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Memberships</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
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
            Member
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <button type="submit" className="btn">
          Activate membership
        </button>
      </form>
      <ul className="list">
        {memberships.map((m) => (
          <li key={m.id}>
            {m.plan.name} · {m.status}
            {m.endsAt ? ` · ends ${new Date(m.endsAt).toLocaleDateString()}` : ""}
            <div className="btn-row">
              {["freeze", "resume", "cancel", "renew", "expire"].map((a) => (
                <button key={a} type="button" className="btn ghost" onClick={() => action(m.id, a)}>
                  {a}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessMembersPage() {
  const [members, setMembers] = useState<
    Array<{ id: string; displayName: string; customerId: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ members: typeof members }>("/fitness/members")
      .then((d) => setMembers(d.members))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Members</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {members.map((m) => (
          <li key={m.id}>
            <strong>{m.displayName}</strong>
            <span className="muted small"> · customer {m.customerId.slice(-8)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessClassesPage() {
  const [classes, setClasses] = useState<
    Array<{
      id: string;
      name: string;
      code: string;
      capacity: number;
      durationMinutes: number;
      classType: { name: string } | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ classes: typeof classes }>("/fitness/classes");
    setClasses(d.classes);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/fitness/classes", "POST", {
        name: fd.get("name"),
        code: fd.get("code"),
        capacity: Number(fd.get("capacity") || 20),
        durationMinutes: Number(fd.get("durationMinutes") || 60),
        membershipRequired: fd.get("membershipRequired") === "on",
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Classes</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <input name="name" placeholder="Name" required />
        <input name="code" placeholder="Code" required />
        <input name="capacity" type="number" defaultValue={20} />
        <input name="durationMinutes" type="number" defaultValue={60} />
        <label>
          <input name="membershipRequired" type="checkbox" /> Membership required
        </label>
        <button type="submit" className="btn">
          Create class
        </button>
      </form>
      <ul className="list">
        {classes.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong> · {c.capacity} spots · {c.durationMinutes}m
            {c.classType ? ` · ${c.classType.name}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessCalendarPage() {
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      startsAt: string;
      endsAt: string;
      capacity: number;
      fitnessClass: { name: string };
      trainer: { displayName: string } | null;
      bookings: unknown[];
    }>
  >([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [trainers, setTrainers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [s, c, t] = await Promise.all([
      apiGet<{ sessions: typeof sessions }>("/fitness/sessions"),
      apiGet<{ classes: typeof classes }>("/fitness/classes"),
      apiGet<{ trainers: typeof trainers }>("/fitness/trainers"),
    ]);
    setSessions(s.sessions);
    setClasses(c.classes);
    setTrainers(t.trainers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/fitness/sessions", "POST", {
        classId: fd.get("classId"),
        startsAt: new Date(String(fd.get("startsAt"))).toISOString(),
        trainerId: fd.get("trainerId") || undefined,
        capacity: fd.get("capacity") ? Number(fd.get("capacity")) : undefined,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Class calendar</h2>
          <p className="muted">Sessions sync to Booking Engine resources.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="classId" required defaultValue="">
          <option value="" disabled>
            Class
          </option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <select name="trainerId" defaultValue="">
          <option value="">Trainer (optional)</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
        <input name="capacity" type="number" placeholder="Capacity override" />
        <button type="submit" className="btn">
          Schedule session
        </button>
      </form>
      <ul className="timeline">
        {sessions.map((s) => (
          <li key={s.id}>
            <strong>{s.fitnessClass.name}</strong> · {new Date(s.startsAt).toLocaleString()}
            {s.trainer ? ` · ${s.trainer.displayName}` : ""} · {s.bookings.length}/{s.capacity}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessTrainersPage() {
  const [trainers, setTrainers] = useState<
    Array<{ id: string; displayName: string; email: string | null; specializations: string[] }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiGet<{ trainers: typeof trainers }>("/fitness/trainers");
    setTrainers(d.trainers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const specs = String(fd.get("specializations") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await apiSend("/fitness/trainers", "POST", {
        displayName: fd.get("displayName"),
        email: fd.get("email") || undefined,
        specializations: specs,
        bio: fd.get("bio") || undefined,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Trainers</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <input name="displayName" placeholder="Display name" required />
        <input name="email" type="email" placeholder="Email" />
        <input name="specializations" placeholder="Specializations (comma-separated)" />
        <input name="bio" placeholder="Bio" />
        <button type="submit" className="btn">
          Add trainer
        </button>
      </form>
      <ul className="list">
        {trainers.map((t) => (
          <li key={t.id}>
            <strong>{t.displayName}</strong>
            {t.email ? ` · ${t.email}` : ""}
            {t.specializations?.length ? ` · ${t.specializations.join(", ")}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessTrainingPage() {
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      startsAt: string;
      status: string;
      customerId: string;
      trainer: { displayName: string };
    }>
  >([]);
  const [trainers, setTrainers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [s, t, c] = await Promise.all([
      apiGet<{ sessions: typeof sessions }>("/fitness/training-sessions"),
      apiGet<{ trainers: typeof trainers }>("/fitness/trainers"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setSessions(s.sessions);
    setTrainers(t.trainers);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const startsAt = new Date(String(fd.get("startsAt")));
    const endsAt = new Date(startsAt.getTime() + Number(fd.get("duration") || 60) * 60000);
    try {
      await apiSend("/fitness/training-sessions", "POST", {
        trainerId: fd.get("trainerId"),
        customerId: fd.get("customerId"),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: fd.get("notes") || undefined,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Personal training</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="trainerId" required defaultValue="">
          <option value="" disabled>
            Trainer
          </option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.displayName}
            </option>
          ))}
        </select>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Member
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <input name="duration" type="number" defaultValue={60} />
        <input name="notes" placeholder="Notes" />
        <button type="submit" className="btn">
          Book session
        </button>
      </form>
      <ul className="list">
        {sessions.map((s) => (
          <li key={s.id}>
            {s.trainer.displayName} · {new Date(s.startsAt).toLocaleString()} · {s.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessAttendancePage() {
  const [rows, setRows] = useState<
    Array<{ id: string; customerId: string; kind: string; status: string; recordedAt: string }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [a, c] = await Promise.all([
      apiGet<{ attendance: typeof rows }>("/fitness/attendance"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setRows(a.attendance);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/fitness/attendance", "POST", {
        customerId: fd.get("customerId"),
        kind: fd.get("kind") || "class",
        status: fd.get("status") || "present",
        location: fd.get("location") || undefined,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Attendance</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Member
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue="class">
          <option value="class">Class</option>
          <option value="gym">Gym</option>
          <option value="training">Personal training</option>
        </select>
        <select name="status" defaultValue="present">
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input name="location" placeholder="Location" />
        <button type="submit" className="btn">
          Record
        </button>
      </form>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}>
            {r.kind} · {r.status} · {new Date(r.recordedAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessCheckInsPage() {
  const [checkIns, setCheckIns] = useState<
    Array<{ id: string; customerId: string; kind: string; checkedInAt: string }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [c, cust] = await Promise.all([
      apiGet<{ checkIns: typeof checkIns }>("/fitness/check-ins"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setCheckIns(c.checkIns);
    setCustomers(cust.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    try {
      await apiSend("/fitness/check-ins", "POST", {
        customerId: fd.get("customerId"),
        kind: fd.get("kind") || "gym",
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Check-ins</h2>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="customerId" required defaultValue="">
          <option value="" disabled>
            Member
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue="gym">
          <option value="gym">Gym</option>
          <option value="class">Class</option>
          <option value="training">Training</option>
        </select>
        <button type="submit" className="btn">
          Check in
        </button>
      </form>
      <ul className="list">
        {checkIns.map((c) => (
          <li key={c.id}>
            {c.kind} · {new Date(c.checkedInAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FitnessAccessPassesPage() {
  const [passes, setPasses] = useState<
    Array<{
      id: string;
      kind: string;
      status: string;
      startsAt: string;
      expiresAt: string;
      offeringId: string | null;
    }>
  >([]);
  const [customers, setCustomers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [p, c] = await Promise.all([
      apiGet<{ passes: typeof passes }>("/fitness/access-passes"),
      apiGet<{ customers: typeof customers }>("/customers"),
    ]);
    setPasses(p.passes);
    setCustomers(c.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const startsAt = new Date(String(fd.get("startsAt")));
    const hours = Number(fd.get("hours") || 24);
    try {
      await apiSend("/fitness/access-passes", "POST", {
        kind: fd.get("kind"),
        customerId: fd.get("customerId") || undefined,
        startsAt: startsAt.toISOString(),
        expiresAt: new Date(startsAt.getTime() + hours * 3600000).toISOString(),
        notes: fd.get("notes") || undefined,
      });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym & Fitness</p>
          <h2>Access passes</h2>
          <p className="muted">Day / guest / trial passes via Commerce. No hardware integrations yet.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="stack" onSubmit={onCreate}>
        <select name="kind" defaultValue="day_pass">
          <option value="day_pass">Day pass</option>
          <option value="guest_pass">Guest pass</option>
          <option value="trial_pass">Trial pass</option>
        </select>
        <select name="customerId" defaultValue="">
          <option value="">Unassigned</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input name="startsAt" type="datetime-local" required />
        <input name="hours" type="number" defaultValue={24} />
        <input name="notes" placeholder="Notes" />
        <button type="submit" className="btn">
          Issue pass
        </button>
      </form>
      <ul className="list">
        {passes.map((p) => (
          <li key={p.id}>
            {p.kind} · {p.status} · {new Date(p.startsAt).toLocaleString()} →{" "}
            {new Date(p.expiresAt).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}
