import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../../lib/api";

type Offering = {
  id: string;
  name: string;
  code: string;
  kind: string;
  status: string;
  basePrice: number;
  featured: boolean;
};

export function CatalogHomePage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await apiSend("/commerce/bootstrap", "POST");
      const data = await apiGet<{ offerings: Offering[] }>("/commerce/offerings");
      setOfferings(data.offerings);
    })().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Catalog</h2>
          <p className="muted">Single catalog for services, products, and packages.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="inline-form wrap">
        <Link className="btn" to="/commerce/services">
          Services
        </Link>
        <Link className="btn ghost" to="/commerce/products">
          Products
        </Link>
        <Link className="btn ghost" to="/commerce/packages">
          Packages
        </Link>
        <Link className="btn ghost" to="/commerce/categories">
          Categories
        </Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {offerings.map((o) => (
              <tr key={o.id}>
                <td>
                  {o.name} {o.featured ? "★" : ""}
                </td>
                <td>{o.kind}</td>
                <td>{o.status}</td>
                <td>{o.basePrice.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<Array<{ id: string; name: string; code: string; parentId: string | null }>>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    await apiSend("/commerce/bootstrap", "POST");
    const data = await apiGet<{ categories: typeof categories }>("/commerce/categories");
    setCategories(data.categories);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/categories", "POST", {
        name,
        code,
        parentId: parentId || undefined,
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
          <h2>Categories</h2>
          <p className="muted">Nested catalog categories.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">No parent</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add category
        </button>
      </form>
      <ul className="list">
        {categories.map((c) => (
          <li key={c.id}>
            {c.name} <span className="muted">({c.code})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
