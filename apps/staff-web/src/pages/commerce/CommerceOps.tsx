import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "../../lib/api";

export function PricingPage() {
  const [rules, setRules] = useState<Array<{ id: string; name: string; kind: string; amount: number; code: string }>>([]);
  const [offerings, setOfferings] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("fixed");
  const [amount, setAmount] = useState("100");
  const [offeringId, setOfferingId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    await apiSend("/commerce/bootstrap", "POST");
    const [r, o] = await Promise.all([
      apiGet<{ rules: typeof rules }>("/commerce/pricing-rules"),
      apiGet<{ offerings: Array<{ id: string; name: string }> }>("/commerce/offerings"),
    ]);
    setRules(r.rules);
    setOfferings(o.offerings);
    if (o.offerings[0]) setOfferingId(o.offerings[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/pricing-rules", "POST", {
        name,
        code,
        kind,
        amount: Number(amount),
        offeringId: offeringId || undefined,
      });
      setName("");
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Pricing rules</h2>
          <p className="muted">Fixed, hourly, seasonal, peak, member, and more.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {["fixed", "hourly", "daily", "weekly", "monthly", "weekend", "peak", "off_peak", "member"].map(
            (k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ),
          )}
        </select>
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
          <option value="">All / none</option>
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add rule
        </button>
      </form>
      <ul className="list">
        {rules.map((r) => (
          <li key={r.id}>
            {r.name} · {r.kind} · {r.amount}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PromotionsPage() {
  const [promotions, setPromotions] = useState<Array<{ id: string; name: string; code: string; kind: string }>>([]);
  const [coupons, setCoupons] = useState<Array<{ id: string; code: string; status: string }>>([]);
  const [promoName, setPromoName] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [couponCode, setCouponCode] = useState("");
  const [promoId, setPromoId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [p, c] = await Promise.all([
      apiGet<{ promotions: typeof promotions }>("/commerce/promotions"),
      apiGet<{ coupons: typeof coupons }>("/commerce/coupons"),
    ]);
    setPromotions(p.promotions);
    setCoupons(c.coupons);
    if (p.promotions[0]) setPromoId(p.promotions[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onPromo(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/promotions", "POST", {
        name: promoName,
        code: promoCode,
        kind: "percent",
        percent: Number(percent),
      });
      setPromoName("");
      setPromoCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onCoupon(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/coupons", "POST", {
        code: couponCode,
        promotionId: promoId || undefined,
      });
      setCouponCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Promotions & coupons</h2>
          <p className="muted">Percentage/fixed discounts and promo codes.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onPromo}>
        <input placeholder="Promo name" value={promoName} onChange={(e) => setPromoName(e.target.value)} required />
        <input placeholder="Code" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} required />
        <input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} />
        <button className="btn" type="submit">
          Add promotion
        </button>
      </form>
      <form className="inline-form wrap" onSubmit={onCoupon}>
        <input placeholder="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} required />
        <select value={promoId} onChange={(e) => setPromoId(e.target.value)}>
          <option value="">No promotion</option>
          {promotions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Add coupon
        </button>
      </form>
      <h3>Promotions</h3>
      <ul className="list">
        {promotions.map((p) => (
          <li key={p.id}>
            {p.name} ({p.code}) · {p.kind}
          </li>
        ))}
      </ul>
      <h3>Coupons</h3>
      <ul className="list">
        {coupons.map((c) => (
          <li key={c.id}>
            {c.code} · {c.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MediaPage() {
  const [media, setMedia] = useState<Array<{ id: string; url: string; altText: string | null }>>([]);
  const [url, setUrl] = useState("https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ media: typeof media }>("/commerce/media");
    setMedia(data.media);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/media", "POST", { url, altText: alt || undefined, isCover: true });
      setAlt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Media library</h2>
          <p className="muted">Images and cover assets for offerings.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Image URL" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <input placeholder="Alt text" value={alt} onChange={(e) => setAlt(e.target.value)} />
        <button className="btn" type="submit">
          Add media
        </button>
      </form>
      <ul className="list">
        {media.map((m) => (
          <li key={m.id}>
            <a href={m.url} target="_blank" rel="noreferrer">
              {m.altText || m.url}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AddonsPage() {
  const [addons, setAddons] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("25");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiGet<{ addons: typeof addons }>("/commerce/addons");
    setAddons(data.addons);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/addons", "POST", { name, price: Number(price) });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Add-ons</h2>
          <p className="muted">Optional extras such as breakfast or airport pickup.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="btn" type="submit">
          Add add-on
        </button>
      </form>
      <ul className="list">
        {addons.map((a) => (
          <li key={a.id}>
            {a.name} · {a.price.toFixed(2)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpsellsPage() {
  const [relations, setRelations] = useState<
    Array<{ id: string; kind: string; offeringId: string; related: { name: string } }>
  >([]);
  const [offerings, setOfferings] = useState<Array<{ id: string; name: string }>>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [kind, setKind] = useState("upsell");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [rel, off] = await Promise.all([
      apiGet<{ relations: typeof relations }>("/commerce/relations"),
      apiGet<{ offerings: Array<{ id: string; name: string }> }>("/commerce/offerings"),
    ]);
    setRelations(rel.relations);
    setOfferings(off.offerings);
    if (off.offerings[0]) setFromId(off.offerings[0].id);
    if (off.offerings[1]) setToId(off.offerings[1].id);
    else if (off.offerings[0]) setToId(off.offerings[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await apiSend("/commerce/relations", "POST", {
        offeringId: fromId,
        relatedOfferingId: toId,
        kind,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Upsells & cross-sells</h2>
          <p className="muted">Related offerings and upgrade suggestions.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <form className="inline-form wrap" onSubmit={onCreate}>
        <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {["upsell", "cross_sell", "related", "upgrade", "suggested_package"].map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select value={toId} onChange={(e) => setToId(e.target.value)}>
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Link
        </button>
      </form>
      <ul className="list">
        {relations.map((r) => (
          <li key={r.id}>
            {r.kind} → {r.related.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ChannelsPage() {
  const [channels, setChannels] = useState<Array<{ id: string; code: string; name: string; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await apiSend("/commerce/bootstrap", "POST");
      const data = await apiGet<{ channels: typeof channels }>("/commerce/channels");
      setChannels(data.channels);
    })().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Commerce</p>
          <h2>Sales channels</h2>
          <p className="muted">Guest PWA, walk-in, reception, and future channels.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {channels.map((c) => (
          <li key={c.id}>
            {c.name} <span className="muted">({c.code})</span> · {c.status}
          </li>
        ))}
      </ul>
    </section>
  );
}
