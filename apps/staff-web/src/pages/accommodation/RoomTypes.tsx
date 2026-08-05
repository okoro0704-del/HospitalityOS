import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Property = { id: string; name: string };
type RoomType = {
  id: string;
  propertyId: string;
  name: string;
  code: string;
  capacity: number;
  baseRate: number;
  bedConfiguration?: string | null;
  status: string;
};

export function RoomTypesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [baseRate, setBaseRate] = useState(100);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ properties: Property[] }>("/accommodation/properties")
      .then((d) => {
        setProperties(d.properties);
        if (d.properties[0]) setPropertyId(d.properties[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    apiGet<{ roomTypes: RoomType[] }>(`/accommodation/room-types?propertyId=${propertyId}`)
      .then((d) => setRoomTypes(d.roomTypes))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [propertyId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/accommodation/room-types", "POST", {
        propertyId,
        name,
        code,
        capacity,
        baseRate,
        bedConfiguration: "1 Queen",
        photoUrls: [],
      });
      setName("");
      setCode("");
      const d = await apiGet<{ roomTypes: RoomType[] }>(
        `/accommodation/room-types?propertyId=${propertyId}`,
      );
      setRoomTypes(d.roomTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h2>Room types</h2>
          <p className="muted">Configure Standard, Deluxe, Suite, and other categories.</p>
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
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
        <input
          type="number"
          min={0}
          value={baseRate}
          onChange={(e) => setBaseRate(Number(e.target.value))}
        />
        <button className="btn" type="submit">
          Add room type
        </button>
      </form>
      <div className="table">
        <div className="table-head">
          <span>Name</span>
          <span>Capacity</span>
          <span>Base rate</span>
        </div>
        {roomTypes.map((rt) => (
          <div key={rt.id} className="table-row">
            <span>
              {rt.name} <span className="muted small">({rt.code})</span>
            </span>
            <span>{rt.capacity}</span>
            <span>
              {rt.baseRate} · {rt.bedConfiguration ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
