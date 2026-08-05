import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

type TenantPayload = {
  tenant: {
    name: string;
    businessType: string;
    enabledModules: string[];
    branding: { primaryColor: string; accentColor: string };
  };
};

type BranchPayload = { branches: Array<{ id: string; name: string; code: string }> };
type CustomerPayload = { customers: Array<{ id: string }> };
type StaffPayload = { staff: Array<{ id: string }> };

export function DashboardPage() {
  const [tenant, setTenant] = useState<TenantPayload["tenant"] | null>(null);
  const [branchCount, setBranchCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);

  useEffect(() => {
    Promise.all([
      apiGet<TenantPayload>("/tenant"),
      apiGet<BranchPayload>("/branches"),
      apiGet<CustomerPayload>("/customers"),
      apiGet<StaffPayload>("/staff"),
    ]).then(([t, b, c, s]) => {
      setTenant(t.tenant);
      setBranchCount(b.branches.length);
      setCustomerCount(c.customers.length);
      setStaffCount(s.staff.length);
    });
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>{tenant?.name ?? "Dashboard"}</h2>
          <p className="muted">
            Platform shell for {tenant?.businessType?.replaceAll("_", " ") ?? "venue"}{" "}
            operations. Module workflows arrive in later sprints.
          </p>
        </div>
      </header>
      <div className="stat-row">
        <article>
          <strong>{tenant?.enabledModules.length ?? 0}</strong>
          <span>Enabled modules</span>
        </article>
        <article>
          <strong>{branchCount}</strong>
          <span>Branches</span>
        </article>
        <article>
          <strong>{customerCount}</strong>
          <span>Customers</span>
        </article>
        <article>
          <strong>{staffCount}</strong>
          <span>Staff</span>
        </article>
      </div>
      <div className="panel soft">
        <h3>Enabled modules</h3>
        <div className="chip-row">
          {(tenant?.enabledModules ?? []).map((m) => (
            <span key={m} className="chip">
              {m.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
