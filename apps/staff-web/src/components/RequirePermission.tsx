import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { getSession } from "../lib/api";
import { canSeeNav, type NavPermission } from "../lib/permissions";

/**
 * Soft route gate — UX only. API remains authoritative.
 * Matches the longest registered path prefix that has a permission.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: NavPermission;
  children: ReactNode;
}) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!canSeeNav(session.role, permission)) {
    return <UnauthorizedState />;
  }
  return children;
}

export function UnauthorizedState() {
  return (
    <section className="page">
      <h2>Unauthorized</h2>
      <p className="muted">
        Your role does not have permission to view this page. Contact a tenant administrator if you
        need access. The API enforces the same boundary independently of this UI.
      </p>
    </section>
  );
}

/** Resolve permission for a pathname from a flat list of { to, permission }. */
export function permissionForPath(
  pathname: string,
  items: Array<{ to: string; permission?: NavPermission }>,
): NavPermission | undefined {
  const sorted = [...items].sort((a, b) => b.to.length - a.to.length);
  for (const item of sorted) {
    if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
      return item.permission;
    }
  }
  return undefined;
}

/** Outlet wrapper used by StaffShell to block deep-linked unauthorized routes. */
export function StaffRouteGate({
  items,
  children,
}: {
  items: Array<{ to: string; permission?: NavPermission }>;
  children: ReactNode;
}) {
  const location = useLocation();
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  const required = permissionForPath(location.pathname, items);
  if (required && !canSeeNav(session.role, required)) {
    return <UnauthorizedState />;
  }
  return children;
}
