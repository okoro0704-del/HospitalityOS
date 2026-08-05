import { useEffect, useState } from "react";
import { HOUSEKEEPING_STATUSES } from "@hospitalityos/shared";
import { apiGet, apiSend } from "../../lib/api";

type Property = { id: string; name: string };
type Room = {
  id: string;
  number: string;
  housekeepingStatus: string;
  occupancyStatus: string;
};

export function HousekeepingPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load(pid: string) {
    const data = await apiGet<{ rooms: Room[] }>(`/accommodation/rooms?propertyId=${pid}`);
    setRooms(data.rooms);
  }

  useEffect(() => {
    apiGet<{ properties: Property[] }>("/accommodation/properties").then((d) => {
      setProperties(d.properties);
      if (d.properties[0]) setPropertyId(d.properties[0].id);
    });
  }, []);

  useEffect(() => {
    if (propertyId) load(propertyId).catch((e) => setError(e.message));
  }, [propertyId]);

  async function setStatus(roomId: string, status: string) {
    try {
      await apiSend(`/accommodation/rooms/${roomId}/housekeeping`, "PATCH", { status });
      await load(propertyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h2>Housekeeping</h2>
          <p className="muted">Clean, dirty, in progress, inspected, out of service.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="stack-list">
        {rooms.map((room) => (
          <article key={room.id} className="panel soft row-between">
            <div>
              <strong>Room {room.number}</strong>
              <p className="muted small">
                {room.housekeepingStatus} · occupancy {room.occupancyStatus}
              </p>
            </div>
            <select
              value={room.housekeepingStatus}
              onChange={(e) => setStatus(room.id, e.target.value)}
            >
              {HOUSEKEEPING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </article>
        ))}
      </div>
    </section>
  );
}
