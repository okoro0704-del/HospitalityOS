import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { getSession } from "../lib/api";

export function RequireStaff({ children }: { children: ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
