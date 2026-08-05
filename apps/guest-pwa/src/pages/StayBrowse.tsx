import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../lib/session";

type Property = { id: string; name: string; propertyType: string; city?: string | null };
type RoomType = {
  id: string;
  name: string;
  description?: string | null;
  capacity: number;
  baseRate: number;
  currency: string;
  photoUrls: string[];
};

export function StayBrowsePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ properties: Property[] }>("/guest/accommodation/properties")
      .then((d) => {
        setProperties(d.properties);
        if (d.properties[0]) setPropertyId(d.properties[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    apiGet<{ roomTypes: RoomType[] }>(`/guest/accommodation/properties/${propertyId}/room-types`)
      .then((d) => setRoomTypes(d.roomTypes))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [propertyId]);

  return (
    <section className="panel">
      <h2>Stay with us</h2>
      <p className="muted">Browse properties and room types. No payment required in Sprint 2.</p>
      {error && <p className="error">{error}</p>}
      {properties.length > 0 && (
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
      )}
      <div className="module-grid">
        {roomTypes.map((rt) => (
          <article key={rt.id} className="module-tile">
            {rt.photoUrls[0] && (
              <img className="room-photo" src={rt.photoUrls[0]} alt="" />
            )}
            <h3>{rt.name}</h3>
            <p>{rt.description ?? `Sleeps ${rt.capacity}`}</p>
            <p className="muted small">
              From {rt.currency} {rt.baseRate} / night
            </p>
            <Link className="btn" to={`/stay/room-types/${rt.id}`}>
              View & book
            </Link>
          </article>
        ))}
        {roomTypes.length === 0 && !error && (
          <p className="muted">No room types available for this property.</p>
        )}
      </div>
    </section>
  );
}
