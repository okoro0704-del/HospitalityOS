import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  clearSession,
  exchangeHandoff,
  rejectQueryAuth,
  saveSession,
} from "../lib/session";

export function LifeOsAuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handoff = params.get("handoff");
    const experienceId = params.get("experience_id") ?? "";
    const returnPath = params.get("return_path") || "/home";

    if (rejectQueryAuth() && !handoff) {
      setError("Query-parameter authentication is not allowed.");
      return;
    }

    if (!handoff || !experienceId) {
      setError("Missing secure handoff. Open this experience from LifeOS.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        clearSession();
        const result = await exchangeHandoff(handoff, experienceId);
        if (cancelled) return;
        saveSession({
          token: result.token,
          sessionId: result.session.sessionId,
          tenantId: result.tenantId,
          tenantSlug: result.tenantSlug,
          customerId: result.customer.id,
          displayName: result.session.displayName,
          experienceId: result.session.experienceId,
          scopes: result.session.scopes,
          expiresAt: result.session.expiresAt,
        });
        navigate(returnPath, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "We couldn't securely connect to this experience.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, navigate]);

  const returnUrl =
    import.meta.env.VITE_LIFEOS_RETURN_URL ?? "http://localhost:5174/app/discover";

  return (
    <div className="auth-screen">
      <p className="brand">HospitalityOS</p>
      {error ? (
        <>
          <h1>Secure connection failed</h1>
          <p className="error">{error}</p>
          <a className="link" href={returnUrl}>
            ← Return to LifeOS
          </a>
        </>
      ) : (
        <>
          <h1>Connecting securely…</h1>
          <p className="muted">
            Verifying LifeOS experience session. TrustID credentials are never received.
          </p>
        </>
      )}
    </div>
  );
}
