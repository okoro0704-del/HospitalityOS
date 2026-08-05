import { Link } from "react-router-dom";

export function ExplorePage() {
  return (
    <section className="panel">
      <h2>Explore</h2>
      <p className="muted">Discover services available at this venue.</p>
      <div className="module-grid">
        <article className="module-tile">
          <h3>Accommodation</h3>
          <p>Browse rooms and reserve your stay.</p>
          <Link className="btn" to="/stay">
            View stays
          </Link>
        </article>
      </div>
    </section>
  );
}
