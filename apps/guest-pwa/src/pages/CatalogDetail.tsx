import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../lib/session";

type Detail = {
  offering: {
    id: string;
    name: string;
    kind: string;
    description?: string | null;
    basePrice: number;
    currencyCode: string;
    serviceDetail?: { bookable: boolean; durationMinutes: number | null } | null;
    availabilityLinks?: Array<{ bookableResourceId: string }>;
    packageItemsAsPkg?: Array<{ child: { name: string }; quantity: number }>;
    addons?: Array<{ name: string; price: number }>;
    relationsFrom?: Array<{ kind: string; related: { id: string; name: string } }>;
  };
  quote: {
    total: number;
    unitPrice: number;
    discountAmount: number;
    currencyCode: string;
  };
};

export function CatalogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [coupon, setCoupon] = useState("");
  const [quoteMsg, setQuoteMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<Detail>(`/guest/commerce/offerings/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [id]);

  async function applyCoupon() {
    if (!id || !coupon) return;
    try {
      const res = await apiSend<{ quote: Detail["quote"] }>("/guest/commerce/pricing/quote", "POST", {
        offeringId: id,
        couponCode: coupon,
      });
      setQuoteMsg(`Quoted total: ${res.quote.total.toFixed(2)} ${res.quote.currencyCode}`);
      setData((prev) => (prev ? { ...prev, quote: res.quote } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote failed");
    }
  }

  async function onBook(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    try {
      await apiSend(`/guest/commerce/services/${id}/book`, "POST", {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        couponCode: coupon || undefined,
      });
      navigate("/my-bookings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    }
  }

  if (!data) {
    return (
      <section className="panel">
        {error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}
      </section>
    );
  }

  const { offering, quote } = data;
  const canBook =
    offering.kind === "service" &&
    (offering.serviceDetail?.bookable ?? true) &&
    (offering.availabilityLinks?.length ?? 0) > 0;

  return (
    <section className="panel">
      <Link className="muted small" to="/catalog">
        ← Catalog
      </Link>
      <h2>{offering.name}</h2>
      <span className="chip">{offering.kind}</span>
      <p>{offering.description || "No description."}</p>
      <p>
        <strong>
          {quote.total.toFixed(2)} {quote.currencyCode}
        </strong>
        {quote.discountAmount > 0 && (
          <span className="muted small"> (saved {quote.discountAmount.toFixed(2)})</span>
        )}
      </p>
      {error && <p className="error">{error}</p>}
      {quoteMsg && <p className="ok">{quoteMsg}</p>}

      <div className="book-form">
        <label>
          Promo code
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} />
        </label>
        <button type="button" className="btn ghost" onClick={applyCoupon}>
          Apply / quote
        </button>
      </div>

      {offering.packageItemsAsPkg && offering.packageItemsAsPkg.length > 0 && (
        <>
          <h3>Includes</h3>
          <ul className="timeline">
            {offering.packageItemsAsPkg.map((i, idx) => (
              <li key={idx}>
                {i.quantity}× {i.child.name}
              </li>
            ))}
          </ul>
        </>
      )}

      {offering.addons && offering.addons.length > 0 && (
        <>
          <h3>Add-ons</h3>
          <ul className="timeline">
            {offering.addons.map((a, idx) => (
              <li key={idx}>
                {a.name} · {a.price.toFixed(2)}
              </li>
            ))}
          </ul>
        </>
      )}

      {offering.relationsFrom && offering.relationsFrom.length > 0 && (
        <>
          <h3>You may also like</h3>
          <ul className="timeline">
            {offering.relationsFrom.map((r) => (
              <li key={r.related.id}>
                <Link to={`/catalog/${r.related.id}`}>
                  [{r.kind}] {r.related.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {canBook ? (
        <form className="book-form" onSubmit={onBook}>
          <h3>Book this service</h3>
          <label>
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </label>
          <label>
            Ends
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
            />
          </label>
          <button className="btn" type="submit">
            Add to booking
          </button>
        </form>
      ) : offering.kind === "service" ? (
        <p className="muted">This service is not linked to a bookable resource yet.</p>
      ) : (
        <p className="muted">Products and packages can be purchased in a later sprint (no payments yet).</p>
      )}
    </section>
  );
}
