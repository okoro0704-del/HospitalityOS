import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";

type Property = { id: string; name: string };
type Calendar = {
  view: string;
  days: string[];
  rooms: Array<{
    id: string;
    number: string;
    roomTypeName: string;
    housekeepingStatus: string;
    maintenanceStatus: string;
  }>;
  reservations: Array<{
    id: string;
    roomId: string | null;
    customerName: string;
    status: string;
    checkInDate: string;
    checkOutDate: string;
    confirmationCode: string;
    isCheckIn: boolean;
    isCheckOut: boolean;
  }>;
};

export function CalendarPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [view, setView] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ properties: Property[] }>("/accommodation/properties").then((d) => {
      setProperties(d.properties);
      if (d.properties[0]) setPropertyId(d.properties[0].id);
    });
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    apiGet<{ calendar: Calendar }>(
      `/accommodation/calendar?propertyId=${propertyId}&view=${view}&date=${date}`,
    )
      .then((d) => setCalendar(d.calendar))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [propertyId, view, date]);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h2>Calendar</h2>
          <p className="muted">Occupancy, reservations, check-ins and check-outs.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="inline-form">
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
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
            {calendar.rooms.map((room) => {
              const roomRes = calendar.reservations.filter((r) => r.roomId === room.id);
              return (
                <article key={room.id} className="panel soft">
                  <div className="row-between">
                    <strong>
                      {room.number} · {room.roomTypeName}
                    </strong>
                    <span className="muted small">
                      {room.housekeepingStatus} / {room.maintenanceStatus}
                    </span>
                  </div>
                  {roomRes.length === 0 ? (
                    <p className="muted small">Available</p>
                  ) : (
                    roomRes.map((r) => (
                      <p key={r.id} className="small">
                        {r.confirmationCode} · {r.customerName} · {r.status}
                        {r.isCheckIn ? " · check-in" : ""}
                        {r.isCheckOut ? " · check-out" : ""} ({r.checkInDate}→{r.checkOutDate})
                      </p>
                    ))
                  )}
                </article>
              );
            })}
          </div>
          <div className="panel soft">
            <h3>Unassigned reservations</h3>
            {calendar.reservations
              .filter((r) => !r.roomId)
              .map((r) => (
                <p key={r.id} className="small">
                  {r.confirmationCode} · {r.customerName} · {r.checkInDate}→{r.checkOutDate}
                </p>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
