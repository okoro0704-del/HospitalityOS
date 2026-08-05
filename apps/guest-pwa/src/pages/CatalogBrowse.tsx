import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Offering = {
  id: string;
  name: string;
  kind: string;
  shortDescription?: string | null;
  basePrice: number;
  computedPrice?: number;
  currencyCode: string;
  featured: boolean;
};

type Category = { id: string; name: string };

export function CatalogBrowsePage() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kind, setKind] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ categories: Category[] }>("/guest/commerce/catalog")
      .then((d) => setCategories(d.categories))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (categoryId) params.set("categoryId", categoryId);
    if (q) params.set("q", q);
    apiGet<{ offerings: Offering[] }>(`/guest/commerce/offerings?${params}`)
      .then((d) => setOfferings(d.offerings))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [kind, categoryId, q]);

  const filteredLabel = useMemo(() => {
    const parts = [];
    if (kind) parts.push(kind);
    if (categoryId) parts.push("category");
    if (q) parts.push(`"${q}"`);
    return parts.length ? parts.join(" · ") : "All offerings";
  }, [kind, categoryId, q]);

  async function validateCoupon() {
    setCouponMsg(null);
    try {
      const data = await apiSend<{
        valid: boolean;
        percent?: number | null;
        amount?: number;
      }>("/guest/commerce/coupons/validate", "POST", { code: coupon });
      if (data.valid) {
        setCouponMsg(
          data.percent != null
            ? `Valid: ${data.percent}% off`
            : `Valid: ${data.amount ?? 0} off`,
        );
      }
    } catch (err) {
      setCouponMsg(err instanceof Error ? err.message : "Invalid coupon");
    }
  }

  return (
    <section className="panel">
      <h2>Catalog</h2>
      <p className="muted">Browse services, products, and packages. No payment in this sprint.</p>
      {error && <p className="error">{error}</p>}
      <div className="book-form">
        <label>
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog" />
        </label>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All</option>
            <option value="service">Services</option>
            <option value="product">Products</option>
            <option value="package">Packages</option>
          </select>
        </label>
        <label>
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Promo code
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="SAVE10" />
        </label>
        <button type="button" className="btn ghost" onClick={validateCoupon}>
          Validate code
        </button>
        {couponMsg && <p className={couponMsg.startsWith("Valid") ? "ok" : "error"}>{couponMsg}</p>}
      </div>
      <p className="muted small">{filteredLabel}</p>
      <div className="module-grid">
        {offerings.map((o) => (
          <article key={o.id} className="module-tile">
            <h3>
              {o.name} {o.featured ? "★" : ""}
            </h3>
            <span className="chip">{o.kind}</span>
            <p className="muted small">{o.shortDescription || "—"}</p>
            <p>
              {(o.computedPrice ?? o.basePrice).toFixed(2)} {o.currencyCode}
            </p>
            <Link className="btn" to={`/catalog/${o.id}`}>
              View
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
