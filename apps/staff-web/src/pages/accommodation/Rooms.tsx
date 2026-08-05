import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Property = { id: string; name: string };
type RoomType = { id: string; name: string };
type Room = {
  id: string;
  number: string;
  roomTypeId: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
};

export function RoomsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [number, setNumber] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ properties: Property[] }>("/accommodation/properties").then((d) => {
      setProperties(d.properties);
      if (d.properties[0]) setPropertyId(d.properties[0].id);
    });
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    Promise.all([
      apiGet<{ roomTypes: RoomType[] }>(`/accommodation/room-types?propertyId=${propertyId}`),
      apiGet<{ rooms: Room[] }>(`/accommodation/rooms?propertyId=${propertyId}`),
    ]).then(([rt, r]) => {
      setRoomTypes(rt.roomTypes);
      setRooms(r.rooms);
      if (rt.roomTypes[0]) setRoomTypeId(rt.roomTypes[0].id);
    });
  }, [propertyId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/accommodation/rooms", "POST", { propertyId, roomTypeId, number });
      setNumber("");
      const r = await apiGet<{ rooms: Room[] }>(`/accommodation/rooms?propertyId=${propertyId}`);
      setRooms(r.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h2>Rooms</h2>
          <p className="muted">Individual inventory with occupancy, housekeeping, and maintenance.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <label className="field">
        Property
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="Room number" value={number} onChange={(e) => setNumber(e.target.value)} required />
        <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add room
        </button>
      </form>
      <div className="table">
        <div className="table-head">
          <span>Room</span>
          <span>Occupancy</span>
          <span>HK / Maint</span>
        </div>
        {rooms.map((r) => (
          <div key={r.id} className="table-row">
            <span>{r.number}</span>
            <span>{r.occupancyStatus}</span>
            <span>
              {r.housekeepingStatus} / {r.maintenanceStatus}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
