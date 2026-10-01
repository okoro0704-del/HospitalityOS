import {
  createRemoteJWKSet,
  jwtVerify,
  decodeProtectedHeader,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import {
  TRUSTID_ISSUER,
  TRUSTID_PROTOCOL_VERSION,
  isTrustIdSubject,
  toAuthenticatedIdentity,
  type AuthenticatedIdentity,
  type TrustAssertionType,
  type TrustIdAssertionClaims,
} from "@hospitalityos/trustid-protocol";
import { config } from "../config.js";

export type TrustVerifyResult =
  | { ok: true; claims: TrustIdAssertionClaims; identity: AuthenticatedIdentity }
  | { ok: false; code: string; message: string };

export type { AuthenticatedIdentity };

const consumedJtis = new Map<string, number>();

/** Shared JWKS fetchers keyed by URL — supports rotation via jose cooldown + kid refresh. */
const jwksCache = new Map<string, JWTVerifyGetKey>();

/** Test/override: inject a GetKey for unit tests (never from client input). */
let testGetKey: JWTVerifyGetKey | null = null;

export function setTrustIdTestGetKey(getKey: JWTVerifyGetKey | null) {
  testGetKey = getKey;
}

export function clearTrustIdReplayCache() {
  consumedJtis.clear();
}

function pruneConsumed() {
  const now = Date.now();
  for (const [jti, exp] of consumedJtis) {
    if (exp < now) consumedJtis.delete(jti);
  }
}

/** Mark assertion jti consumed (replay protection within this process + durable store). */
export function markAssertionConsumed(jti: string, expUnix: number) {
  pruneConsumed();
  consumedJtis.set(jti, expUnix * 1000 + 60_000);
}

export function wasAssertionConsumed(jti: string): boolean {
  pruneConsumed();
  return consumedJtis.has(jti);
}

function getJwks(jwksUrl: string): JWTVerifyGetKey {
  if (testGetKey) return testGetKey;
  let cached = jwksCache.get(jwksUrl);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(jwksUrl), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
    jwksCache.set(jwksUrl, cached);
  }
  return cached;
}

/** Force JWKS re-fetch (e.g. after unknown kid during rotation). */
export function invalidateTrustIdJwksCache(jwksUrl?: string) {
  if (jwksUrl) jwksCache.delete(jwksUrl);
  else jwksCache.clear();
}

function normalizeTrustClaims(payload: JWTPayload): TrustIdAssertionClaims | null {
  if (
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.app_id !== "string" ||
    !Array.isArray(payload.scopes) ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number"
  ) {
    return null;
  }
  if (!isTrustIdSubject(payload.sub)) return null;

  const audRaw = payload.aud;
  const aud = Array.isArray(audRaw) ? String(audRaw[0]) : typeof audRaw === "string" ? audRaw : "";
  if (!aud) return null;

  const assertionType: TrustAssertionType =
    payload.assertion_type === "step_up" ? "step_up" : "authentication";

  return {
    iss: String(payload.iss ?? TRUSTID_ISSUER),
    sub: payload.sub,
    aud,
    exp: Number(payload.exp),
    iat: Number(payload.iat),
    nbf: payload.nbf != null ? Number(payload.nbf) : undefined,
    jti: payload.jti,
    sid: payload.sid,
    app_id: payload.app_id,
    scopes: payload.scopes.map(String),
    ver: typeof payload.ver === "string" ? payload.ver : undefined,
    assertion_type: assertionType,
    display_name: typeof payload.display_name === "string" ? payload.display_name : undefined,
    device_trust:
      payload.device_trust === "trusted" ||
      payload.device_trust === "temporary" ||
      payload.device_trust === "untrusted"
        ? payload.device_trust
        : undefined,
    device_id: typeof payload.device_id === "string" ? payload.device_id : undefined,
    auth_time: payload.auth_time != null ? Number(payload.auth_time) : undefined,
    assurance_level:
      typeof payload.assurance_level === "string" ? payload.assurance_level : undefined,
    step_up_for: typeof payload.step_up_for === "string" ? payload.step_up_for : undefined,
  };
}

export type VerifyTrustIdOptions = {
  assertion: string;
  expectedAudience: string;
  jwksUrl?: string;
  issuer?: string;
  /** Required scopes (all must be present). Default: openid */
  requiredScopes?: string[];
  /** Expected assertion type. Default: authentication */
  expectedAssertionType?: TrustAssertionType;
  /** For step-up: required step_up_for value */
  expectedStepUpFor?: string;
  /** Skip local replay check (caller uses durable store). Default false */
  skipLocalReplayCheck?: boolean;
  /** Max assertion age in seconds from iat (skew bound). Default 300 */
  maxAgeSeconds?: number;
};

/**
 * Central TrustID assertion verifier — the only path routes/services should use.
 * Never accepts client-supplied JWKS or public keys.
 */
export async function verifyTrustIdAssertion(
  opts: VerifyTrustIdOptions,
): Promise<TrustVerifyResult> {
  const jwksUrl = opts.jwksUrl ?? config.trustidJwksUrl;
  const issuer = opts.issuer ?? config.trustidIssuer;
  const expectedType = opts.expectedAssertionType ?? "authentication";
  const requiredScopes = opts.requiredScopes ?? ["openid"];
  const maxAge = opts.maxAgeSeconds ?? 300;

  try {
    const header = decodeProtectedHeader(opts.assertion);
    if (header.alg && header.alg !== "EdDSA") {
      return {
        ok: false,
        code: "alg_confusion",
        message: "Only EdDSA TrustID assertions are accepted",
      };
    }
    if (!header.kid) {
      return { ok: false, code: "invalid_token", message: "Missing key id (kid)" };
    }

    let getKey = getJwks(jwksUrl);
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(opts.assertion, getKey, {
        issuer,
        audience: opts.expectedAudience,
        algorithms: ["EdDSA"],
        maxTokenAge: `${maxAge}s`,
      }));
    } catch (firstErr) {
      // Unknown kid during rotation — invalidate cache and retry once
      const msg = firstErr instanceof Error ? firstErr.message : "";
      if (/no applicable key|JWKSNoMatchingKey|kid/i.test(msg)) {
        invalidateTrustIdJwksCache(jwksUrl);
        getKey = getJwks(jwksUrl);
        ({ payload } = await jwtVerify(opts.assertion, getKey, {
          issuer,
          audience: opts.expectedAudience,
          algorithms: ["EdDSA"],
          maxTokenAge: `${maxAge}s`,
        }));
      } else {
        throw firstErr;
      }
    }

    const claims = normalizeTrustClaims(payload);
    if (!claims) {
      return { ok: false, code: "invalid_token", message: "Missing or malformed TrustID claims" };
    }

    if (claims.ver != null && claims.ver !== TRUSTID_PROTOCOL_VERSION) {
      return {
        ok: false,
        code: "invalid_protocol_version",
        message: `Unsupported TrustID protocol version: ${claims.ver}`,
      };
    }

    const assertionType = claims.assertion_type ?? "authentication";
    if (assertionType !== expectedType) {
      return {
        ok: false,
        code: "wrong_assertion_type",
        message: `Expected assertion_type=${expectedType}`,
      };
    }

    for (const scope of requiredScopes) {
      if (!claims.scopes.includes(scope)) {
        return {
          ok: false,
          code: "missing_scope",
          message: `Missing required scope: ${scope}`,
        };
      }
    }

    if (expectedType === "step_up") {
      if (!claims.scopes.includes("step_up")) {
        return { ok: false, code: "missing_scope", message: "Missing step_up scope" };
      }
      if (opts.expectedStepUpFor && claims.step_up_for !== opts.expectedStepUpFor) {
        return {
          ok: false,
          code: "wrong_step_up",
          message: "Step-up assertion does not match required action",
        };
      }
    }

    if (!opts.skipLocalReplayCheck && wasAssertionConsumed(claims.jti)) {
      return { ok: false, code: "replay", message: "Assertion has already been used" };
    }

    return {
      ok: true,
      claims,
      identity: toAuthenticatedIdentity(claims),
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : "Verification failed";
    const claim = (err as { claim?: string }).claim;
    const code = (err as { code?: string }).code;
    if (name === "JWTExpired" || code === "ERR_JWT_EXPIRED" || claim === "exp") {
      return { ok: false, code: "token_expired", message: "TrustID assertion expired" };
    }
    if (claim === "aud" || /audience|\"aud\"/i.test(message)) {
      return { ok: false, code: "wrong_audience", message: "Assertion audience mismatch" };
    }
    if (claim === "iss" || /issuer|\"iss\"/i.test(message)) {
      return { ok: false, code: "wrong_issuer", message: "Assertion issuer mismatch" };
    }
    if (/max.?age|iat/i.test(message) || claim === "iat") {
      return { ok: false, code: "token_expired", message: "TrustID assertion too old" };
    }
    if (/signature|JWSInvalid|JWSSignatureVerificationFailed/i.test(message)) {
      return { ok: false, code: "invalid_signature", message: "Invalid TrustID signature" };
    }
    if (/no applicable key|JWKSNoMatchingKey|kid/i.test(message)) {
      return { ok: false, code: "unknown_key", message: "Unknown or revoked TrustID signing key" };
    }
    return { ok: false, code: "invalid_token", message: "Invalid TrustID assertion" };
  }
}

export async function introspectTrustIdSession(
  jti: string,
  trustidApiUrl?: string,
): Promise<{ active: boolean; reason?: string }> {
  try {
    const base = trustidApiUrl ?? config.trustidApiUrl;
    const res = await fetch(`${base}/sessions/${encodeURIComponent(jti)}/active`);
    if (!res.ok) return { active: false, reason: "inactive" };
    return (await res.json()) as { active: boolean; reason?: string };
  } catch {
    return { active: false, reason: "unavailable" };
  }
}

/** Notify TrustID that the assertion jti was exchanged (cross-app replay protection). */
export async function consumeTrustIdAssertion(
  jti: string,
  trustidApiUrl?: string,
): Promise<{ ok: boolean; code?: string }> {
  try {
    const base = trustidApiUrl ?? config.trustidApiUrl;
    const res = await fetch(`${base}/assertions/consume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jti }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, code: body.error ?? "consume_failed" };
  } catch {
    return { ok: true, code: "remote_unavailable" };
  }
}
