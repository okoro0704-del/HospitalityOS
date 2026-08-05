import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  EXPERIENCE_TOKEN_ISSUER,
  type ExperienceTokenClaims,
} from "@hospitalityos/shared";
import { config } from "../config.js";

export type VerifyResult =
  | { ok: true; claims: ExperienceTokenClaims }
  | { ok: false; code: string; message: string };

function normalizeClaims(payload: JWTPayload): ExperienceTokenClaims | null {
  const scopes = payload.scopes;
  if (
    typeof payload.sub !== "string" ||
    typeof payload.aud !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.experience_id !== "string" ||
    typeof payload.business_id !== "string" ||
    !Array.isArray(scopes)
  ) {
    return null;
  }
  return {
    iss: String(payload.iss ?? EXPERIENCE_TOKEN_ISSUER),
    sub: payload.sub,
    aud: Array.isArray(payload.aud) ? payload.aud[0] : payload.aud,
    sid: payload.sid,
    exp: Number(payload.exp),
    iat: Number(payload.iat),
    jti: payload.jti,
    experience_id: payload.experience_id as string,
    business_id: payload.business_id as string,
    scopes: scopes.map(String),
    display_name:
      typeof payload.display_name === "string" ? payload.display_name : undefined,
  };
}

export async function verifyExperienceToken(opts: {
  token: string;
  expectedAudience: string;
  jwksUrl?: string;
  issuer?: string;
}): Promise<VerifyResult> {
  try {
    const JWKS = createRemoteJWKSet(new URL(opts.jwksUrl ?? config.lifeosJwksUrl));
    const { payload } = await jwtVerify(opts.token, JWKS, {
      issuer: opts.issuer ?? config.lifeosIssuer,
      audience: opts.expectedAudience,
      algorithms: ["EdDSA"],
    });
    const claims = normalizeClaims(payload);
    if (!claims) {
      return { ok: false, code: "invalid_token", message: "Missing required claims" };
    }
    return { ok: true, claims };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : "Verification failed";
    if (name === "JWTExpired" || /exp/i.test(message)) {
      return {
        ok: false,
        code: "token_expired",
        message: "This experience session has expired. Reopen the experience.",
      };
    }
    if (/audience/i.test(message)) {
      return {
        ok: false,
        code: "wrong_audience",
        message: "This experience cannot use this session.",
      };
    }
    return {
      ok: false,
      code: "invalid_token",
      message: "We couldn't securely connect to this experience.",
    };
  }
}

export async function exchangeLifeOsHandoff(opts: {
  handoff: string;
  experienceId: string;
  lifeosApiUrl?: string;
}): Promise<{ token: string; expires_at: string; session_id: string; scopes: string[] }> {
  const base = opts.lifeosApiUrl ?? config.lifeosApiUrl;
  const res = await fetch(`${base}/experience-sessions/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoff: opts.handoff, experienceId: opts.experienceId }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(String(data.message ?? "Exchange failed"));
    (err as Error & { code: string }).code = String(data.error ?? "invalid_token");
    throw err;
  }
  return {
    token: String(data.token),
    expires_at: String(data.expires_at ?? ""),
    session_id: String(data.session_id ?? ""),
    scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
  };
}

export async function introspectLifeOsJti(
  jti: string,
  lifeosApiUrl?: string,
): Promise<{ active: boolean; reason?: string }> {
  const base = lifeosApiUrl ?? config.lifeosApiUrl;
  const res = await fetch(`${base}/experience-sessions/introspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jti }),
  });
  if (!res.ok) return { active: false, reason: "invalid_token" };
  return (await res.json()) as { active: boolean; reason?: string };
}
