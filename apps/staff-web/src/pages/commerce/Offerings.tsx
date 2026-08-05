import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Offering = {
  id: string;
  name: string;
  code: string;
  basePrice: number;
  status: string;
  kind: string;
};

type Resource = { id: string; name: string };

export function ServicesPage() {
  const [services, setServices] = useState<Offering[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("50");
  const [resourceId, setResourceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    await apiSend("/commerce/bootstrap", "POST");
    const [s, r] = await Promise.all([
      apiGet<{ services: Offering[] }>("/commerce/services"),
      apiGet<{ resources: Resource[] }>("/booking/resources").catch(() => ({ resources: [] })),
    ]);
    setServices(s.services);
    setResources(r.resources);
    if (r.resources[0]) setResourceId(r.resources[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/offerings", "POST", {
        kind: "service",
        name,
        code,
        basePrice: Number(price),
        status: "active",
        visibility: "public",
        durationMinutes: 60,
        bookable: true,
        bookableResourceIds: resourceId ? [resourceId] : [],
        moduleId: "events",
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
          <p className="eyebrow">Commerce</p>
          <h2>Services</h2>
          <p className="muted">Bookable experiences linked to the Booking Engine.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
          <option value="">No resource link</option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add service
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.code}</td>
                <td>{s.basePrice.toFixed(2)}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProductsPage() {
  const [products, setProducts] = useState<Offering[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("10");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    await apiSend("/commerce/bootstrap", "POST");
    const data = await apiGet<{ products: Offering[] }>("/commerce/products");
    setProducts(data.products);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/offerings", "POST", {
        kind: "product",
        name,
        code,
        sku: sku || code,
        basePrice: Number(price),
        status: "active",
        visibility: "public",
        unit: "each",
      });
      setName("");
      setCode("");
      setSku("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Products</h2>
          <p className="muted">Physical or digital items — no booking required.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="btn" type="submit">
          Add product
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.code}</td>
                <td>{p.basePrice.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PackagesPage() {
  const [packages, setPackages] = useState<Offering[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [childId, setChildId] = useState("");
  const [bundlePrice, setBundlePrice] = useState("80");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    await apiSend("/commerce/bootstrap", "POST");
    const [pkgs, all] = await Promise.all([
      apiGet<{ packages: Offering[] }>("/commerce/packages"),
      apiGet<{ offerings: Offering[] }>("/commerce/offerings"),
    ]);
    setPackages(pkgs.packages);
    const children = all.offerings.filter((o) => o.kind !== "package");
    setOfferings(children);
    if (children[0]) setChildId(children[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/offerings", "POST", {
        kind: "package",
        name,
        code,
        basePrice: Number(bundlePrice),
        bundlePrice: Number(bundlePrice),
        status: "active",
        visibility: "public",
        packageItems: childId
          ? [{ childOfferingId: childId, quantity: 1, required: true }]
          : [],
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
          <p className="eyebrow">Commerce</p>
          <h2>Packages</h2>
          <p className="muted">Bundles of services and/or products.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input
          type="number"
          step="0.01"
          value={bundlePrice}
          onChange={(e) => setBundlePrice(e.target.value)}
        />
        <select value={childId} onChange={(e) => setChildId(e.target.value)}>
          <option value="">No item</option>
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.kind})
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add package
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Bundle price</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.code}</td>
                <td>{p.basePrice.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
