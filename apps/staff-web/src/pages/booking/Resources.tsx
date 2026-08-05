import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

type Resource = {
  id: string;
  name: string;
  code: string;
  moduleId: string;
  capacity: number;
  status: string;
};
type Category = { id: string; name: string; code: string };

export function BookingResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [moduleId, setModuleId] = useState("events");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    await apiSend("/booking/bootstrap", "POST");
    const [r, c] = await Promise.all([
      apiGet<{ resources: Resource[] }>("/booking/resources"),
      apiGet<{ categories: Category[] }>("/booking/categories"),
    ]);
    setResources(r.resources);
    setCategories(c.categories);
    if (c.categories[0]) setCategoryId(c.categories[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/booking/resources", "POST", {
        name,
        code,
        categoryId,
        moduleId,
        capacity: 1,
        tags: [],
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
          <p className="eyebrow">Booking engine</p>
          <h2>Resources</h2>
          <p className="muted">Generic bookable inventory — rooms, tables, halls, gear, and more.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input placeholder="Module id" value={moduleId} onChange={(e) => setModuleId(e.target.value)} />
        <button className="btn" type="submit">
          Add resource
        </button>
      </form>
      <div className="table">
        <div className="table-head">
          <span>Name</span>
          <span>Module</span>
          <span>Status</span>
        </div>
        {resources.map((r) => (
          <div key={r.id} className="table-row">
            <span>
              {r.name} <span className="muted small">({r.code})</span>
            </span>
            <span>{r.moduleId}</span>
            <span>
              {r.status} · cap {r.capacity}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
