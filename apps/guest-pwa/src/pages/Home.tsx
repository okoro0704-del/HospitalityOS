import { useEffect, useState } from "react";
import { apiGet, getSession } from "../lib/session";

type PublicTenant = {
  tenant: {
    name: string;
    businessType: string;
    branding: { primaryColor: string; accentColor: string };
    enabledModules: string[];
  };
};

type GuestModules = {
  modules: Array<{ id: string; name: string; description: string; guestNavKey?: string }>;
};

export function HomePage() {
  const session = getSession();
  const [tenantName, setTenantName] = useState("Your venue");
  const [modules, setModules] = useState<GuestModules["modules"]>([]);

  useEffect(() => {
    if (!session) return;
    apiGet<PublicTenant>(`/tenants/${session.tenantSlug}/public`)
      .then((data) => setTenantName(data.tenant.name))
      .catch(() => undefined);
    apiGet<GuestModules>("/guest/modules")
      .then((data) => setModules(data.modules))
      .catch(() => undefined);
  }, [session]);

  return (
    <section className="panel">
      <p className="eyebrow">{tenantName}</p>
      <h2>Your experience hub</h2>
      <p className="muted">
        Browse stays, book shared resources, and manage your visit from one hub.
      </p>
      <div className="module-grid">
        {modules.length === 0 ? (
          <p className="muted">No guest-facing modules enabled yet.</p>
        ) : (
          modules.map((m) => {
            const href =
              m.guestNavKey === "fitness" || m.id === "gym_membership" || m.id === "fitness_classes"
                ? "/fitness"
                : m.guestNavKey === "dining" || m.id === "restaurant"
                  ? "/dining"
                  : m.guestNavKey === "stay" || m.id === "accommodation"
                    ? "/stay"
                    : m.guestNavKey === "bookings"
                      ? "/book"
                      : null;
            return (
              <article key={m.id} className="module-tile">
                <h3>{m.name}</h3>
                <p>{m.description}</p>
                {href ? (
                  <a className="chip" href={href}>
                    Open
                  </a>
                ) : (
                  <span className="chip">Coming soon</span>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
