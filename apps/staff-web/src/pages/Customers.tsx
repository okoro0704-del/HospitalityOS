import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

type Customer = {
  id: string;
  displayName: string;
  email?: string | null;
  status: string;
  createdAt: string;
};

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    apiGet<{ customers: Customer[] }>("/customers").then((d) => setCustomers(d.customers));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">CRM shell</p>
          <h2>Customers</h2>
          <p className="muted">Tenant-scoped customer list. Detailed CRM arrives later.</p>
        </div>
      </header>
      <div className="table">
        <div className="table-head">
          <span>Name</span>
          <span>Email</span>
          <span>Status</span>
        </div>
        {customers.length === 0 ? (
          <p className="muted">No customers yet. Guests appear after LifeOS handoff.</p>
        ) : (
          customers.map((c) => (
            <div key={c.id} className="table-row">
              <span>{c.displayName}</span>
              <span>{c.email ?? "—"}</span>
              <span>{c.status}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
