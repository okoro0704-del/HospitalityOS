import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { apiGet, getSession, logout } from "../lib/api";
import { canSeeNav, type NavPermission } from "../lib/permissions";
import { StaffRouteGate } from "./RequirePermission";

type TenantPayload = {
  tenant: {
    name: string;
    businessType: string;
    branding: { primaryColor: string };
    enabledModules: string[];
    suiteModules?: string[];
    folioChargeEnabled?: boolean;
    posSettlementMethods?: string[];
  };
};

type NavItem = { to: string; label: string; end?: boolean; permission?: NavPermission; module?: string };

const CORE_NAV: NavItem[] = [
  { to: "/", label: "Today", end: true },
  { to: "/customers", label: "Customers", permission: "customers.read" },
  { to: "/operations", label: "Operations", permission: "inventory.read", module: "inventory" },
  { to: "/notifications", label: "Notifications", permission: "notifications.manage" },
  { to: "/overview", label: "Overview", permission: "reports.read" },
  { to: "/billing", label: "Billing", permission: "payments.read" },
  { to: "/staff", label: "Staff", permission: "staff.manage" },
  { to: "/settings", label: "Settings", permission: "settings.manage" },
  { to: "/modules", label: "Modules", permission: "modules.manage" },
];

const CRM_NAV: NavItem[] = [
  { to: "/customers/segments", label: "Segments", permission: "customers.read" },
  { to: "/customers/tags", label: "Tags", permission: "customers.read" },
  { to: "/customers/interactions", label: "Interactions", permission: "customers.read" },
  { to: "/customers/feedback", label: "Feedback", permission: "customers.read" },
  { to: "/customers/consent", label: "Consent", permission: "customers.read" },
  { to: "/customers/loyalty", label: "Loyalty", permission: "customers.read" },
  { to: "/notifications/templates", label: "Templates", permission: "notifications.manage" },
  { to: "/notifications/rules", label: "Rules", permission: "notifications.manage" },
  { to: "/notifications/deliveries", label: "Deliveries", permission: "notifications.manage" },
  { to: "/billing/invoices", label: "Invoices", permission: "payments.read" },
  { to: "/billing/collections", label: "Collections", permission: "payments.read" },
  { to: "/billing/reconciliation", label: "Reconciliation", permission: "payments.read" },
];

const BOOKING_NAV: NavItem[] = [
  { to: "/booking/resources", label: "Resources", permission: "bookings.read" },
  { to: "/booking/bookings", label: "Bookings", permission: "bookings.read" },
  { to: "/booking/schedules", label: "Schedules", permission: "bookings.read" },
  { to: "/booking/availability", label: "Availability", permission: "bookings.read" },
  { to: "/booking/policies", label: "Policies", permission: "bookings.write" },
  { to: "/booking/waitlist", label: "Waitlists", permission: "bookings.read" },
  { to: "/booking/calendar", label: "Engine Calendar", permission: "bookings.read" },
  { to: "/booking/timeline", label: "Booking Timeline", permission: "bookings.read" },
];

const COMMERCE_NAV: NavItem[] = [
  { to: "/commerce", label: "Catalog", permission: "orders.read" },
  { to: "/commerce/categories", label: "Categories", permission: "orders.read" },
  { to: "/commerce/services", label: "Services", permission: "orders.read" },
  { to: "/commerce/products", label: "Products", permission: "orders.read" },
  { to: "/commerce/packages", label: "Packages", permission: "orders.read" },
  { to: "/commerce/pricing", label: "Pricing", permission: "orders.write" },
  { to: "/commerce/promotions", label: "Promotions", permission: "orders.write" },
  { to: "/commerce/coupons", label: "Coupons", permission: "orders.write" },
  { to: "/commerce/media", label: "Media", permission: "media.read" },
  { to: "/commerce/addons", label: "Add-ons", permission: "orders.read" },
  { to: "/commerce/upsells", label: "Upsells", permission: "orders.read" },
  { to: "/commerce/pricing-rules", label: "Pricing Rules", permission: "orders.write" },
  { to: "/commerce/channels", label: "Sales Channels", permission: "orders.read" },
];

const ACCOMMODATION_NAV: NavItem[] = [
  { to: "/accommodation/properties", label: "Properties", permission: "bookings.read" },
  { to: "/accommodation/room-types", label: "Room Types", permission: "bookings.read" },
  { to: "/accommodation/rooms", label: "Rooms", permission: "bookings.read" },
  { to: "/accommodation/reservations", label: "Reservations", permission: "bookings.read" },
  { to: "/accommodation/calendar", label: "Stay Calendar", permission: "bookings.read" },
  { to: "/accommodation/guests", label: "Guests", permission: "customers.read" },
  { to: "/accommodation/housekeeping", label: "Housekeeping", permission: "bookings.write" },
  { to: "/accommodation/maintenance", label: "Maintenance", permission: "bookings.write" },
];

const DINING_NAV: NavItem[] = [
  { to: "/dining", label: "Dining Dashboard", permission: ["orders.read", "bookings.read"] },
  { to: "/dining/tables", label: "Tables", permission: "bookings.read" },
  { to: "/dining/reservations", label: "Dining Reservations", permission: "bookings.read" },
  { to: "/dining/menus", label: "Menus", permission: "orders.read" },
  { to: "/dining/orders", label: "Orders", permission: "orders.read" },
  { to: "/dining/kitchen", label: "Kitchen", permission: "orders.write" },
  { to: "/dining/shifts", label: "Shifts", permission: "orders.read" },
];

const BAR_NAV: NavItem[] = [
  { to: "/dining", label: "Bar POS", permission: ["orders.read", "bookings.read"] },
  { to: "/dining/orders", label: "Open Tabs", permission: "orders.read" },
  { to: "/dining/menus", label: "Beverage Menu", permission: "orders.read" },
];

const FITNESS_NAV: NavItem[] = [
  { to: "/fitness", label: "Fitness Dashboard", permission: "bookings.read" },
  { to: "/fitness/facilities", label: "Facilities", permission: "bookings.read" },
  { to: "/fitness/members", label: "Members", permission: "customers.read" },
  { to: "/fitness/plans", label: "Membership Plans", permission: "bookings.read" },
  { to: "/fitness/memberships", label: "Memberships", permission: "bookings.read" },
  { to: "/fitness/classes", label: "Classes", permission: "bookings.read" },
  { to: "/fitness/calendar", label: "Class Calendar", permission: "bookings.read" },
  { to: "/fitness/trainers", label: "Trainers", permission: "bookings.read" },
  { to: "/fitness/training", label: "Personal Training", permission: "bookings.read" },
  { to: "/fitness/attendance", label: "Attendance", permission: "bookings.write" },
  { to: "/fitness/check-ins", label: "Check-ins", permission: "bookings.write" },
  { to: "/fitness/access-passes", label: "Access Passes", permission: "bookings.read" },
];

const SPA_NAV: NavItem[] = [
  { to: "/spa", label: "Spa Dashboard", permission: "bookings.read" },
  { to: "/spa/appointments", label: "Appointments", permission: "bookings.read" },
  { to: "/spa/calendar", label: "Spa Calendar", permission: "bookings.read" },
  { to: "/spa/treatments", label: "Treatments", permission: "bookings.read" },
  { to: "/spa/therapists", label: "Therapists", permission: "bookings.read" },
  { to: "/spa/rooms", label: "Treatment Rooms", permission: "bookings.read" },
  { to: "/spa/facilities", label: "Spa Facilities", permission: "bookings.read" },
  { to: "/spa/clients", label: "Clients", permission: "customers.read" },
  { to: "/spa/consultations", label: "Consultations", permission: "customers.notes" },
  { to: "/spa/notes", label: "Treatment Notes", permission: "customers.notes" },
  { to: "/spa/wellness", label: "Wellness Facilities", permission: "bookings.read" },
  { to: "/spa/packages", label: "Packages", permission: "bookings.read" },
  { to: "/spa/memberships", label: "Spa Memberships", permission: "bookings.read" },
  { to: "/spa/waitlist", label: "Spa Waitlist", permission: "bookings.read" },
];

const EVENTS_NAV: NavItem[] = [
  { to: "/events", label: "Events Dashboard", permission: "bookings.read" },
  { to: "/events/list", label: "Events", permission: "bookings.read" },
  { to: "/events/venues", label: "Venues", permission: "bookings.read" },
  { to: "/events/calendar", label: "Event Calendar", permission: "bookings.read" },
  { to: "/events/tickets", label: "Tickets", permission: "bookings.read" },
  { to: "/events/seating", label: "Seating", permission: "bookings.read" },
  { to: "/events/attendees", label: "Attendees", permission: "bookings.read" },
  { to: "/events/packages", label: "Event Packages", permission: "bookings.read" },
  { to: "/events/rentals", label: "Venue Rentals", permission: "bookings.read" },
  { to: "/events/waitlist", label: "Event Waitlists", permission: "bookings.read" },
];

const CINEMA_NAV: NavItem[] = [
  { to: "/cinema", label: "Cinema Dashboard", permission: "bookings.read" },
  { to: "/cinema/venues", label: "Venues", permission: "bookings.read" },
  { to: "/cinema/screens", label: "Screens", permission: "bookings.read" },
  { to: "/cinema/seats", label: "Seat Maps", permission: "bookings.read" },
  { to: "/cinema/content", label: "Content", permission: "bookings.read" },
  { to: "/cinema/showtimes", label: "Showtimes", permission: "bookings.read" },
  { to: "/cinema/tickets", label: "Tickets", permission: "bookings.read" },
  { to: "/cinema/attendees", label: "Attendees", permission: "bookings.read" },
  { to: "/cinema/check-in", label: "Check-in", permission: "bookings.write" },
  { to: "/cinema/concessions", label: "Concessions", permission: "orders.read" },
  { to: "/cinema/orders", label: "Orders", permission: "orders.read" },
  { to: "/cinema/shifts", label: "Shifts", permission: "orders.read" },
];

const OPS_NAV: NavItem[] = [
  { to: "/operations", label: "Operations Dashboard", permission: "inventory.read" },
  { to: "/operations/inventory", label: "Inventory", permission: "inventory.read" },
  { to: "/operations/locations", label: "Locations", permission: "inventory.read" },
  { to: "/operations/stock", label: "Stock", permission: "inventory.read" },
  { to: "/operations/transfers", label: "Transfers", permission: "inventory.adjust" },
  { to: "/operations/counts", label: "Stock Counts", permission: "inventory.adjust" },
  { to: "/operations/alerts", label: "Reorder Alerts", permission: "inventory.read" },
  { to: "/operations/suppliers", label: "Suppliers", permission: "inventory.read" },
  { to: "/operations/purchase-requests", label: "Purchase Requests", permission: "inventory.adjust" },
  { to: "/operations/assets", label: "Assets", permission: "inventory.read" },
  { to: "/operations/maintenance", label: "Maintenance", permission: "inventory.adjust" },
  { to: "/operations/tasks", label: "Tasks", permission: "inventory.read" },
];

function filterNav(items: NavItem[], role: string | undefined, modules: string[]) {
  return items.filter((item) => {
    if (item.module && !modules.includes(item.module)) return false;
    return canSeeNav(role, item.permission);
  });
}

export function StaffShell() {
  const session = getSession();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState("HospitalityOS");
  const [primary, setPrimary] = useState("#0F766E");
  const [modules, setModules] = useState<string[]>([]);
  const [suiteModules, setSuiteModules] = useState<string[]>([]);

  useEffect(() => {
    apiGet<TenantPayload>("/tenant")
      .then((data) => {
        setTenantName(data.tenant.name);
        setPrimary(data.tenant.branding.primaryColor);
        setModules(data.tenant.enabledModules);
        setSuiteModules(data.tenant.suiteModules ?? []);
        document.documentElement.style.setProperty("--brand", data.tenant.branding.primaryColor);
      })
      .catch(() => undefined);
  }, []);

  const nav = useMemo(() => {
    const role = session?.role;
    const suite = new Set(
      suiteModules.length
        ? suiteModules
        : [
            ...(modules.includes("accommodation") ? ["accommodation"] : []),
            ...(modules.includes("restaurant") ? ["dining"] : []),
            ...(modules.includes("gym_membership") || modules.includes("spa_services")
              ? ["gym_spa"]
              : []),
            ...(modules.includes("events") ? ["events"] : []),
            "billing",
            "crm",
          ],
    );
    const items = [
      ...filterNav(CORE_NAV, role, modules),
      ...filterNav(CRM_NAV, role, modules),
    ];
    if (suite.has("dining") || suite.has("bar")) {
      items.push(...filterNav(COMMERCE_NAV, role, modules));
    }
    if (suite.has("accommodation") || suite.has("shared_homes")) {
      items.push(...filterNav(BOOKING_NAV, role, modules));
      items.push(...filterNav(ACCOMMODATION_NAV, role, modules));
    }
    if (suite.has("dining")) {
      items.push(...filterNav(DINING_NAV, role, modules));
    } else if (suite.has("bar")) {
      items.push(...filterNav(BAR_NAV, role, modules));
    }
    if (suite.has("gym_spa")) {
      items.push(...filterNav(FITNESS_NAV, role, modules));
      items.push(...filterNav(SPA_NAV, role, modules));
    }
    if (suite.has("events")) {
      items.push(...filterNav(EVENTS_NAV, role, modules));
    }
    if (modules.includes("cinema")) {
      items.push(...filterNav(CINEMA_NAV, role, modules));
    }
    if (modules.includes("inventory")) {
      items.push(...filterNav(OPS_NAV, role, modules));
    }
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.to)) return false;
      seen.add(item.to);
      return true;
    });
  }, [modules, suiteModules, session?.role]);

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
          <p className="muted small">
            {session?.trustIdVerified || session?.authProvider === "trustid"
              ? "Signed in with TrustID"
              : "Legacy / development password"}
          </p>
        </div>
        <nav className="aside-nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={Boolean(item.end)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn ghost full" onClick={onLogout}>
          Sign out
        </button>
      </aside>
      <div className="staff-content" style={{ ["--brand" as string]: primary }}>
        <StaffRouteGate items={nav}>
          <Outlet />
        </StaffRouteGate>
      </div>
    </div>
  );
}
