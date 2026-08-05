import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { getSession } from "../lib/session";

export function RequireGuest({ children }: { children: ReactNode }) {
  const session = getSession();
  if (!session) {
    return <Navigate to="/start" replace />;
  }
  return children;
}
