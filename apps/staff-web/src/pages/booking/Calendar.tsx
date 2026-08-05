import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";

type Calendar = {
  view: string;
  days: string[];
  resources: Array<{ id: string; name: string; moduleId: string; status: string }>;
  bookings: Array<{
    id: string;
    confirmationCode: string;
    status: string;
    startsAt: string;
    endsAt: string;
    resourceIds: string[];
    customerName?: string | null;
  }>;
};

export function BookingCalendarPage() {
  const [view, setView] = useState("week");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ calendar: Calendar }>(`/booking/calendar?view=${view}&date=${date}`)
      .then((d) => setCalendar(d.calendar))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [view, date]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Booking engine</p>
          <h2>Calendar</h2>
          <p className="muted">Cross-module calendar — day, week, month, resource, and branch views.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="inline-form">
        <select value={view} onChange={(e) => setView(e.target.value)}>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="timeline">Timeline</option>
          <option value="agenda">Agenda</option>
          <option value="resource">Resource</option>
          <option value="branch">Branch</option>
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {calendar && (
        <>
          <div className="chip-row">
            {calendar.days.map((d) => (
              <span key={d} className="chip quiet">
                {d}
              </span>
            ))}
          </div>
          <div className="stack-list">
            {calendar.resources.map((r) => {
              const related = calendar.bookings.filter((b) => b.resourceIds.includes(r.id));
              return (
                <article key={r.id} className="panel soft">
                  <strong>
                    {r.name} · {r.moduleId}
                  </strong>
                  {related.length === 0 ? (
                    <p className="muted small">Free</p>
                  ) : (
                    related.map((b) => (
                      <p key={b.id} className="small">
                        {b.confirmationCode} · {b.status} · {b.customerName ?? "—"}
                      </p>
                    ))
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
