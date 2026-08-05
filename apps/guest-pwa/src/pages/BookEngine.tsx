import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Resource = {
  id: string;
  name: string;
  moduleId: string;
  capacity: number;
  status: string;
};

export function BookEnginePage() {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ resources: Resource[] }>("/guest/booking/resources")
      .then((d) => {
        setResources(d.resources);
        if (d.resources[0]) setResourceId(d.resources[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    if (!resourceId || !startsAt || !endsAt) {
      setAvailable(null);
      return;
    }
    const q = new URLSearchParams({
      resourceId,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
    });
    apiGet<{ available: boolean }>(`/guest/booking/availability?${q}`)
      .then((d) => setAvailable(d.available))
      .catch(() => setAvailable(false));
  }, [resourceId, startsAt, endsAt]);

  async function onBook(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const resource = resources.find((r) => r.id === resourceId);
    try {
      await apiSend("/guest/booking/bookings", "POST", {
        moduleId: resource?.moduleId ?? "events",
        resourceId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        joinWaitlistIfUnavailable: true,
      });
      navigate("/my-bookings");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Booking failed";
      if (msg.toLowerCase().includes("waitlist")) {
        setMessage(msg);
      } else {
        setError(msg);
      }
    }
  }

  return (
    <section className="panel">
      <h2>Book a resource</h2>
      <p className="muted">Generic booking for any reservable service at this venue.</p>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <form className="book-form" onSubmit={onBook}>
        <label>
          Resource
          <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.moduleId})
              </option>
            ))}
          </select>
        </label>
        <label>
          Starts
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </label>
        <label>
          Ends
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        </label>
        {available === true && <p className="ok">Available</p>}
        {available === false && <p className="error">Unavailable — you can still try waitlist</p>}
        <button className="btn" type="submit">
          Book / join waitlist
        </button>
      </form>
      <p className="muted small">
        Looking for a room stay? <Link to="/stay">Open accommodation</Link>
      </p>
    </section>
  );
}
