import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

type TenantPayload = {
  tenant: {
    name: string;
    slug: string;
    businessType: string;
    branding: {
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      theme: string;
      logoUrl?: string | null;
    };
    contact: {
      email?: string | null;
      phone?: string | null;
      city?: string | null;
      country?: string | null;
    };
    operatingHours: Array<{ day: string; open: string | null; close: string | null; closed: boolean }>;
    experienceId?: string | null;
  };
};

export function SettingsPage() {
  const [tenant, setTenant] = useState<TenantPayload["tenant"] | null>(null);

  useEffect(() => {
    apiGet<TenantPayload>("/tenant").then((d) => setTenant(d.tenant));
  }, []);

  if (!tenant) return <section className="page">Loading…</section>;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Business configuration</p>
          <h2>Settings</h2>
          <p className="muted">
            Branding and business configuration model ready for white-label later.
          </p>
        </div>
      </header>
      <div className="settings-grid">
        <article className="panel soft">
          <h3>Identity</h3>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{tenant.name}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>{tenant.slug}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{tenant.businessType}</dd>
            </div>
            <div>
              <dt>LifeOS experience</dt>
              <dd>{tenant.experienceId ?? "—"}</dd>
            </div>
          </dl>
        </article>
        <article className="panel soft">
          <h3>Branding</h3>
          <div className="swatches">
            <span style={{ background: tenant.branding.primaryColor }} />
            <span style={{ background: tenant.branding.secondaryColor }} />
            <span style={{ background: tenant.branding.accentColor }} />
          </div>
          <p className="muted small">Theme: {tenant.branding.theme}</p>
        </article>
        <article className="panel soft">
          <h3>Contact</h3>
          <p>{tenant.contact.email}</p>
          <p>{tenant.contact.phone}</p>
          <p>
            {tenant.contact.city}, {tenant.contact.country}
          </p>
        </article>
        <article className="panel soft">
          <h3>Operating hours</h3>
          <ul className="hours">
            {tenant.operatingHours.map((h) => (
              <li key={h.day}>
                <span>{h.day}</span>
                <span>{h.closed ? "Closed" : `${h.open} – ${h.close}`}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
