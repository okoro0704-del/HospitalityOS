import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

type Staff = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
};

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);

  useEffect(() => {
    apiGet<{ staff: Staff[] }>("/staff").then((d) => setStaff(d.staff));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Team</p>
          <h2>Staff</h2>
          <p className="muted">Roles and permissions are tenant-scoped.</p>
        </div>
      </header>
      <div className="table">
        <div className="table-head">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
        </div>
        {staff.map((s) => (
          <div key={s.id} className="table-row">
            <span>{s.displayName}</span>
            <span>{s.email}</span>
            <span>{s.role}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
