import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Detail = {
  roomType: {
    id: string;
    name: string;
    description?: string | null;
    capacity: number;
    baseRate: number;
    currency: string;
    bedConfiguration?: string | null;
    photoUrls: string[];
    propertyId: string;
  };
  property: { id: string; name: string };
};

export function RoomTypeDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<Detail>(`/guest/accommodation/room-types/${id}`)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [id]);

  useEffect(() => {
    if (!detail || !checkInDate || !checkOutDate) {
      setAvailable(null);
      return;
    }
    apiGet<{ available: boolean }>(
      `/guest/accommodation/availability?propertyId=${detail.property.id}&roomTypeId=${detail.roomType.id}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}`,
    )
      .then((d) => setAvailable(d.available))
      .catch(() => setAvailable(false));
  }, [detail, checkInDate, checkOutDate]);

  async function onBook(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend("/guest/accommodation/reservations", "POST", {
        propertyId: detail.property.id,
        roomTypeId: detail.roomType.id,
        checkInDate,
        checkOutDate,
      });
      navigate("/bookings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  if (!detail && !error) return <section className="panel">Loading…</section>;

  return (
    <section className="panel">
      <Link className="link" to="/stay">
        ← All rooms
      </Link>
      {detail && (
        <>
          <h2>{detail.roomType.name}</h2>
          <p className="muted">{detail.property.name}</p>
          {detail.roomType.photoUrls[0] && (
            <img className="room-photo wide" src={detail.roomType.photoUrls[0]} alt="" />
          )}
          <p>{detail.roomType.description}</p>
          <p className="muted small">
            Sleeps {detail.roomType.capacity} · {detail.roomType.bedConfiguration ?? "Flexible beds"} ·{" "}
            {detail.roomType.currency} {detail.roomType.baseRate}/night
          </p>
          <form className="book-form" onSubmit={onBook}>
            <label>
              Check-in
              <input
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                required
              />
            </label>
            <label>
              Check-out
              <input
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                required
              />
            </label>
            {available === true && <p className="ok">Available for your dates</p>}
            {available === false && <p className="error">Not available for those dates</p>}
            {error && <p className="error">{error}</p>}
            <button className="btn" type="submit" disabled={busy || available === false}>
              {busy ? "Booking…" : "Reserve"}
            </button>
          </form>
        </>
      )}
      {error && !detail && <p className="error">{error}</p>}
    </section>
  );
}
