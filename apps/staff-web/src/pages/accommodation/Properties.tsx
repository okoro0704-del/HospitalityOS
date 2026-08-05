import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Property = {
  id: string;
  name: string;
  code: string;
  propertyType: string;
  status: string;
  checkInTime: string;
  checkOutTime: string;
  city?: string | null;
};

export function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [propertyType, setPropertyType] = useState("hotel");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ properties: Property[] }>("/accommodation/properties");
    setProperties(data.properties);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiSend("/accommodation/properties", "POST", {
        name,
        code,
        propertyType,
        city: "Lagos",
        country: "NG",
      });
      setName("");
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Accommodation</p>
          <h2>Properties</h2>
          <p className="muted">Manage hotels, resorts, apartments, and short-stay properties.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          <option value="hotel">Hotel</option>
          <option value="resort">Resort</option>
          <option value="apartment">Apartment</option>
          <option value="serviced_apartment">Serviced apartment</option>
          <option value="guest_house">Guest house</option>
          <option value="hostel">Hostel</option>
          <option value="vacation_rental">Vacation rental</option>
          <option value="short_let">Short-let</option>
        </select>
        <button className="btn" type="submit">
          Add property
        </button>
      </form>
      <div className="table">
        <div className="table-head">
          <span>Name</span>
          <span>Type</span>
          <span>Check-in / out</span>
        </div>
        {properties.map((p) => (
          <div key={p.id} className="table-row">
            <span>
              {p.name} <span className="muted small">({p.code})</span>
            </span>
            <span>{p.propertyType.replaceAll("_", " ")}</span>
            <span>
              {p.checkInTime} / {p.checkOutTime}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
