import { useParams } from "react-router-dom";

const LABELS: Record<string, string> = {
  "front-desk": "Front Desk",
  events: "Events",
  gym: "Gym Operations",
  spa: "Spa Operations",
  restaurant: "Restaurant Operations",
};

export function OperationsPage() {
  const { area = "front-desk" } = useParams();
  const title = LABELS[area] ?? "Operations";

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations shell</p>
          <h2>{title}</h2>
          <p className="muted">
            Navigation and layout only for Sprint 1. Business workflows for this area are
            intentionally not implemented yet.
          </p>
        </div>
      </header>
      <div className="placeholder">
        <p>{title} workspace placeholder</p>
      </div>
    </section>
  );
}
