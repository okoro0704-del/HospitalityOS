/**
 * TrustID protocol types — shared between TrustID IdP and consuming apps.
 * No biometric data. No business authorization. Identity claims only.
 */

export const TRUSTID_ISSUER = "trustid";
export const TRUSTID_PROTOCOL_VERSION = "1";

/** Immutable ecosystem identity prefix. */
export const TRUSTID_ID_PREFIX = "TID-";

export type TrustApplicationType =
  | "LIFEOS"
  | "HOSPITALITYOS"
  | "TOKEN_NETWORK"
  | "BUSINESS_PORTAL"
  | "OTHER";

export type TrustDeviceStatus =
  | "pending"
  | "trusted"
  | "temporary"
  | "denied"
  | "revoked";

export type TrustAuthChallengeStatus =
  | "pending"
  | "approved"
  | "temporary"
  | "denied"
  | "expired"
  | "consumed";

/** Assertion kinds issued by TrustID. */
export type TrustAssertionType = "authentication" | "step_up";

/** Scopes TrustID may assert — NOT business permissions. */
export const TRUSTID_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "device.trust",
  "step_up",
] as const;

export type TrustIdScope = (typeof TRUSTID_SCOPES)[number];

/**
 * Short-lived authentication assertion claims issued by TrustID.
 * Applications validate these then create their OWN local sessions.
 */
export interface TrustIdAssertionClaims {
  iss: string;
  /** Immutable TrustID subject: TID-… */
  sub: string;
  /** Registered application public id (audience) */
  aud: string;
  exp: number;
  iat: number;
  nbf?: number;
  jti: string;
  /** Authentication session id within TrustID */
  sid: string;
  /** Registered application id */
  app_id: string;
  scopes: string[];
  /** Protocol version — reject unknown */
  ver?: string;
  /** authentication | step_up */
  assertion_type?: TrustAssertionType;
  /** Optional display name — never biometrics */
  display_name?: string;
  /** Device trust outcome for this assertion */
  device_trust?: "trusted" | "temporary" | "untrusted";
  /** Device id when known (opaque) */
  device_id?: string;
  /** Authentication time (unix) when distinct from iat */
  auth_time?: number;
  /** Assurance / ACR-style level from TrustID */
  assurance_level?: string;
  /** For step-up: action class this assertion authorizes (authn proof only) */
  step_up_for?: string;
}

/**
 * Minimal identity context HospitalityOS (and other apps) keep in memory.
 * Never includes passwords, biometrics, device secrets, or private keys.
 */
export interface AuthenticatedIdentity {
  trustId: string;
  issuer: string;
  audience: string;
  authenticationTime: number;
  assuranceLevel?: string;
  scopes: string[];
  sessionReference: string;
  assertionType: TrustAssertionType;
  deviceTrust?: "trusted" | "temporary" | "untrusted";
  jti: string;
}

export interface TrustApplicationPublic {
  applicationId: string;
  name: string;
  type: TrustApplicationType;
  publicId: string;
  allowedScopes: string[];
  status: "active" | "revoked";
  createdAt: string;
  revokedAt?: string | null;
}

export interface TrustedDevicePublic {
  deviceId: string;
  name: string;
  status: TrustDeviceStatus;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
}

export function isTrustIdSubject(value: string): boolean {
  return value.startsWith(TRUSTID_ID_PREFIX) && value.length > TRUSTID_ID_PREFIX.length + 4;
}

export function normalizeTrustIdSubject(value: string): string {
  const v = value.trim();
  if (isTrustIdSubject(v)) return v;
  if (v.startsWith("TID")) return v.includes("-") ? v : `TID-${v.slice(3)}`;
  return `${TRUSTID_ID_PREFIX}${v}`;
}

export function toAuthenticatedIdentity(claims: TrustIdAssertionClaims): AuthenticatedIdentity {
  return {
    trustId: claims.sub,
    issuer: claims.iss,
    audience: claims.aud,
    authenticationTime: claims.auth_time ?? claims.iat,
    assuranceLevel: claims.assurance_level,
    scopes: claims.scopes,
    sessionReference: claims.sid,
    assertionType: claims.assertion_type ?? "authentication",
    deviceTrust: claims.device_trust,
    jti: claims.jti,
  };
}
