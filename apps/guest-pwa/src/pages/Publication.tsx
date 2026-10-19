import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../lib/session";

type PubItem = {
  title: string;
  summary: string | null;
  itemType: string;
  canonicalSourceUrl: string;
  tenant: { slug: string; displayName: string };
  assetReferences: Array<{ href: string; kind: string; alt: string | null }>;
  relatedItem: { kind: string; id: string; canonicalSourceUrl: string } | null;
  publishedAt: string | null;
};

/**
 * Public deep-link surface for business publications (LifeOS discovery).
 * No guest session required — reads unauthenticated public API only.
 */
export function PublicationPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<PubItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/v1/public/publications/${encodeURIComponent(id)}`, {
          headers: { Accept: "application/json" },
          credentials: "omit",
        });
        if (!res.ok) {
          if (active) setError(res.status === 404 ? "Publication not found" : "Unable to load");
          return;
        }
        const data = (await res.json()) as PubItem;
        if (active) setItem(data);
      } catch {
        if (active) setError("Unable to load");
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <main style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
        <p>{error}</p>
        <Link to="/">Back</Link>
      </main>
    );
  }

  if (!item) {
    return (
      <main style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
        <p>Loading…</p>
      </main>
    );
  }

  const video = item.assetReferences.find((a) => a.kind === "video");
  const image = item.assetReferences.find((a) => a.kind === "image") || item.assetReferences[0];

  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <p style={{ opacity: 0.7, marginBottom: "0.5rem" }}>{item.tenant.displayName}</p>
      <h1 style={{ marginTop: 0 }}>{item.title}</h1>
      {item.summary ? <p>{item.summary}</p> : null}
      {video ? (
        <video
          src={video.href}
          poster={image?.href}
          controls
          playsInline
          style={{ width: "100%", borderRadius: 8, background: "#111" }}
        />
      ) : image ? (
        <img
          src={image.href}
          alt={image.alt || item.title}
          style={{ width: "100%", borderRadius: 8, display: "block" }}
        />
      ) : null}
      {item.relatedItem ? (
        <p style={{ marginTop: "1.5rem" }}>
          <Link to={`/catalog/${item.relatedItem.id}`}>View offering</Link>
        </p>
      ) : null}
      <p style={{ marginTop: "1rem" }}>
        <Link to="/catalog">Browse catalog</Link>
      </p>
    </main>
  );
}
