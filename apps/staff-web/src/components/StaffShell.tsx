import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiGet, getSession, logout } from "../lib/api";

type TenantPayload = {
  tenant: {
    name: string;
    businessType: string;
    branding: { primaryColor: string };
    enabledModules: string[];
  };
};

const CORE_NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/modules", label: "Modules" },
  { to: "/customers", label: "Customers" },
  { to: "/staff", label: "Staff" },
];

const BOOKING_NAV = [
  { to: "/booking/resources", label: "Resources" },
  { to: "/booking/bookings", label: "Bookings" },
  { to: "/booking/schedules", label: "Schedules" },
  { to: "/booking/availability", label: "Availability" },
  { to: "/booking/policies", label: "Policies" },
  { to: "/booking/waitlist", label: "Waitlists" },
  { to: "/booking/calendar", label: "Engine Calendar" },
  { to: "/booking/timeline", label: "Booking Timeline" },
];

const COMMERCE_NAV = [
  { to: "/commerce", label: "Catalog" },
  { to: "/commerce/categories", label: "Categories" },
  { to: "/commerce/services", label: "Services" },
  { to: "/commerce/products", label: "Products" },
  { to: "/commerce/packages", label: "Packages" },
  { to: "/commerce/pricing", label: "Pricing" },
  { to: "/commerce/promotions", label: "Promotions" },
  { to: "/commerce/coupons", label: "Coupons" },
  { to: "/commerce/media", label: "Media" },
  { to: "/commerce/addons", label: "Add-ons" },
  { to: "/commerce/upsells", label: "Upsells" },
  { to: "/commerce/pricing-rules", label: "Pricing Rules" },
  { to: "/commerce/channels", label: "Sales Channels" },
];

const ACCOMMODATION_NAV = [
  { to: "/accommodation/properties", label: "Properties" },
  { to: "/accommodation/room-types", label: "Room Types" },
  { to: "/accommodation/rooms", label: "Rooms" },
  { to: "/accommodation/reservations", label: "Reservations" },
  { to: "/accommodation/calendar", label: "Stay Calendar" },
  { to: "/accommodation/guests", label: "Guests" },
  { to: "/accommodation/housekeeping", label: "Housekeeping" },
  { to: "/accommodation/maintenance", label: "Maintenance" },
];

const DINING_NAV = [
  { to: "/dining", label: "Dining Dashboard" },
  { to: "/dining/tables", label: "Tables" },
  { to: "/dining/reservations", label: "Dining Reservations" },
  { to: "/dining/menus", label: "Menus" },
  { to: "/dining/orders", label: "Orders" },
  { to: "/dining/kitchen", label: "Kitchen" },
  { to: "/dining/shifts", label: "Shifts" },
];

const FITNESS_NAV = [
  { to: "/fitness", label: "Fitness Dashboard" },
  { to: "/fitness/facilities", label: "Facilities" },
  { to: "/fitness/members", label: "Members" },
  { to: "/fitness/plans", label: "Membership Plans" },
  { to: "/fitness/memberships", label: "Memberships" },
  { to: "/fitness/classes", label: "Classes" },
  { to: "/fitness/calendar", label: "Class Calendar" },
  { to: "/fitness/trainers", label: "Trainers" },
  { to: "/fitness/training", label: "Personal Training" },
  { to: "/fitness/attendance", label: "Attendance" },
  { to: "/fitness/check-ins", label: "Check-ins" },
  { to: "/fitness/access-passes", label: "Access Passes" },
];

const OTHER_OPS = [
  { to: "/operations/events", label: "Events", module: "events" },
  { to: "/operations/spa", label: "Spa", module: "spa_services" },
  { to: "/settings", label: "Settings" },
];

export function StaffShell() {
  const session = getSession();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState("HospitalityOS");
  const [primary, setPrimary] = useState("#0F766E");
  const [modules, setModules] = useState<string[]>([]);

  useEffect(() => {
    apiGet<TenantPayload>("/tenant")
      .then((data) => {
        setTenantName(data.tenant.name);
        setPrimary(data.tenant.branding.primaryColor);
        setModules(data.tenant.enabledModules);
        document.documentElement.style.setProperty("--brand", data.tenant.branding.primaryColor);
      })
      .catch(() => undefined);
  }, []);

  const nav = useMemo(() => {
    const items = [...CORE_NAV, ...COMMERCE_NAV, ...BOOKING_NAV];
    if (modules.includes("accommodation")) {
      items.push(...ACCOMMODATION_NAV);
    }
    if (modules.includes("restaurant")) {
      items.push(...DINING_NAV);
    }
    if (modules.includes("gym_membership") || modules.includes("fitness_classes")) {
      items.push(...FITNESS_NAV);
    }
    for (const item of OTHER_OPS) {
      if (!("module" in item) || modules.includes(item.module!)) {
        items.push({ to: item.to, label: item.label });
      }
    }
    return items;
  }, [modules]);

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="staff-layout">
      <aside className="staff-aside">
        <div className="aside-brand">
          <p className="brand">HospitalityOS</p>
          <h1>{tenantName}</h1>
          <p className="muted small">
            {session?.displayName} · {session?.role}
          </p>
        </div>
        <nav className="aside-nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={"end" in item ? Boolean((item as { end?: boolean }).end) : false}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn ghost full" onClick={onLogout}>
          Sign out
        </button>
      </aside>
      <div className="staff-content" style={{ ["--brand" as string]: primary }}>
        <Outlet />
      </div>
    </div>
  );
}
