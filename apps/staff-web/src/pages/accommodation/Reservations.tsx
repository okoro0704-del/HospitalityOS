import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Property = { id: string; name: string };
type RoomType = { id: string; name: string };
type Customer = { id: string; displayName: string };
type Room = { id: string; number: string; roomTypeId: string };
type Reservation = {
  id: string;
  confirmationCode: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  roomId?: string | null;
  roomTypeId: string;
  customerId: string;
};

export function ReservationsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadReservations(pid: string) {
    const data = await apiGet<{ reservations: Reservation[] }>(
      `/accommodation/reservations?propertyId=${pid}`,
    );
    setReservations(data.reservations);
  }

  useEffect(() => {
    Promise.all([
      apiGet<{ properties: Property[] }>("/accommodation/properties"),
      apiGet<{ customers: Customer[] }>("/customers"),
    ]).then(([p, c]) => {
      setProperties(p.properties);
      setCustomers(c.customers);
      if (p.properties[0]) setPropertyId(p.properties[0].id);
      if (c.customers[0]) setCustomerId(c.customers[0].id);
    });
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    Promise.all([
      apiGet<{ roomTypes: RoomType[] }>(`/accommodation/room-types?propertyId=${propertyId}`),
      apiGet<{ rooms: Room[] }>(`/accommodation/rooms?propertyId=${propertyId}`),
      loadReservations(propertyId),
    ]).then(([rt, r]) => {
      setRoomTypes(rt.roomTypes);
      setRooms(r.rooms);
      if (rt.roomTypes[0]) setRoomTypeId(rt.roomTypes[0].id);
    });
  }, [propertyId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!customerId) {
        const created = await apiSend<{ customer: Customer }>("/customers", "POST", {
          displayName: "Walk-in Guest",
        });
        setCustomerId(created.customer.id);
        await apiSend("/accommodation/reservations", "POST", {
          propertyId,
          roomTypeId,
          customerId: created.customer.id,
          checkInDate,
          checkOutDate,
          status: "confirmed",
        });
      } else {
        await apiSend("/accommodation/reservations", "POST", {
          propertyId,
          roomTypeId,
          customerId,
          checkInDate,
          checkOutDate,
          status: "confirmed",
        });
      }
      await loadReservations(propertyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function act(id: string, action: "check-in" | "check-out" | "cancel", roomId?: string) {
    setError(null);
    try {
      await apiSend(`/accommodation/reservations/${id}/${action}`, "POST", roomId ? { roomId } : {});
      await loadReservations(propertyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h2>Reservations</h2>
          <p className="muted">Full lifecycle — create, modify, check-in, check-out, cancel.</p>
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
      <form className="inline-form wrap" onSubmit={onCreate}>
        <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </select>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Walk-in (auto-create)</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} required />
        <input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} required />
        <button className="btn" type="submit">
          Create reservation
        </button>
      </form>
      <div className="stack-list">
        {reservations.map((r) => (
          <article key={r.id} className="panel soft">
            <div className="row-between">
              <strong>{r.confirmationCode}</strong>
              <span className="chip">{r.status.replaceAll("_", " ")}</span>
            </div>
            <p className="muted small">
              {r.checkInDate} → {r.checkOutDate}
            </p>
            <div className="actions">
              {["confirmed", "pending"].includes(r.status) && (
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    act(
                      r.id,
                      "check-in",
                      r.roomId ??
                        rooms.find((room) => room.roomTypeId === r.roomTypeId)?.id,
                    )
                  }
                >
                  Check in
                </button>
              )}
              {r.status === "checked_in" && (
                <button type="button" className="btn" onClick={() => act(r.id, "check-out")}>
                  Check out
                </button>
              )}
              {["draft", "pending", "confirmed"].includes(r.status) && (
                <button type="button" className="btn ghost" onClick={() => act(r.id, "cancel")}>
                  Cancel
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
