import { resolveAppEnv, validateRuntimeConfig, assertProductionSafe, isDeployedEnv } from "./lib/env-validate.js";

const appEnv = resolveAppEnv();

const emailProvider = (process.env.EMAIL_PROVIDER ?? (appEnv === "production" ? "" : "mock")).toLowerCase();

export const config = {
  env: appEnv,
  port: Number(process.env.HOS_PORT ?? process.env.PORT ?? 8800),
  host: process.env.HOS_HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? (isDeployedEnv(appEnv) ? "" : "file:./dev.db"),
  /**
   * Staging only: every request except /health and /ready must present this value in the
   * `x-hos-access` header, so a staging URL is never usable anonymously.
   */
  stagingAccessToken: process.env.HOS_STAGING_ACCESS_TOKEN ?? "",
  /** Optional direct URL for migrations behind a pooler. */
  directDatabaseUrl: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me",
  webhookSecret: process.env.WEBHOOK_SECRET ?? process.env.SESSION_SECRET ?? "dev-only-webhook-secret",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5180,http://localhost:5181")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  lifeosApiUrl: process.env.LIFEOS_API_URL ?? "http://localhost:8790",
  lifeosJwksUrl:
    process.env.LIFEOS_JWKS_URL ?? "http://localhost:8790/.well-known/experience-keys",
  lifeosIssuer: process.env.LIFEOS_EXPECTED_ISSUER ?? "lifeos",
  /** TrustID IdP — independent identity provider */
  trustidApiUrl: process.env.TRUSTID_API_URL ?? "http://localhost:8791",
  trustidJwksUrl:
    process.env.TRUSTID_JWKS_URL ?? "http://localhost:8791/.well-known/jwks.json",
  trustidIssuer: process.env.TRUSTID_EXPECTED_ISSUER ?? "trustid",
  /** Audience / application publicId registered at TrustID for this HOS deployment */
  trustidAudience: process.env.TRUSTID_AUDIENCE ?? "hospitalityos",
  guestSessionTtlHours: 12,
  staffSessionTtlHours: 12,
  /**
   * Demo guest entry without LifeOS.
   * Default OFF — set ALLOW_DEMO_GUEST=true explicitly for local demos.
   */
  allowDemoGuest: (process.env.ALLOW_DEMO_GUEST ?? "false").toLowerCase() === "true",
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT ?? 20),
  loginRateWindowMs: Number(process.env.LOGIN_RATE_WINDOW_MS ?? 60_000),
  /** mock | smtp | console */
  emailProvider: emailProvider || "mock",
  smtpUrl: process.env.SMTP_URL ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "noreply@hospitalityos.local",
  smtpReplyTo: process.env.SMTP_REPLY_TO ?? "",
  /** Private media blob root (local filesystem). Production should use dedicated volume or object storage mount. */
  mediaRoot: process.env.MEDIA_ROOT ?? "./media-private",
  mediaSigningSecret: process.env.MEDIA_SIGNING_SECRET ?? "",
  mediaMaxBytes: Number(process.env.MEDIA_MAX_BYTES ?? 10 * 1024 * 1024),
  mediaAllowedTypes: (process.env.MEDIA_ALLOWED_TYPES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * LifeOS primitive binding: `local` (default) keeps in-process adapters;
   * `remote` binds ElfCom / Sovereign Drive / Platform Jobs HTTP adapters.
   */
  primitivesMode: (process.env.PRIMITIVES_MODE ?? "local").toLowerCase() as "local" | "remote",
  /** ElfCom messaging engine — default Phase E port 4000 */
  elfcomUrl: process.env.ELFCOM_URL ?? "http://localhost:4000",
  /** Sovereign Drive storage — default Phase E port 4100 */
  sovereignDriveUrl: process.env.SOVEREIGN_DRIVE_URL ?? "http://localhost:4100",
  /** Platform Jobs — default Phase E port 3000 */
  platformJobsUrl: process.env.PLATFORM_JOBS_URL ?? "http://localhost:3000",
  /** Master Distributor control plane — default Phase E port 3100 */
  masterDistributorUrl: process.env.MASTER_DISTRIBUTOR_URL ?? "http://localhost:3100",
  /** FundzMan wallet engine — default port 4200 */
  fundzmanUrl: process.env.FUNDZMAN_URL ?? "http://localhost:4200",
  /** TransportationOS courier dispatch — default port 4300 */
  transportationOsUrl: process.env.TRANSPORTATION_OS_URL ?? "http://localhost:4300",
  /** Bearer for remote primitive calls (TrustID service token in production). */
  primitivesServiceToken: process.env.PRIMITIVES_SERVICE_TOKEN ?? "dev-primitives-token",
  /** Shared secret for POST /internal/distributor/provision */
  internalProvisionToken:
    process.env.INTERNAL_PROVISION_TOKEN ??
    process.env.PRIMITIVES_SERVICE_TOKEN ??
    "dev-primitives-token",
  /** Public launch URL templates ({subdomain} replaced) */
  staffLaunchUrlTemplate:
    process.env.HOS_STAFF_LAUNCH_URL ?? "https://{subdomain}.lifeos.app/staff",
  guestLaunchUrlTemplate:
    process.env.HOS_GUEST_LAUNCH_URL ?? "https://{subdomain}.lifeos.app/guest",
  /** When true, skip production assert (tests only). */
  skipProductionAssert: process.env.HOS_SKIP_PRODUCTION_ASSERT === "true",
  /** Digi Core public origin. Empty until configured. Production refuses to start without it. */
  digiCoreBaseUrl: (process.env.DIGI_CORE_BASE_URL ?? "").replace(/\/$/, ""),
  /** DDI public origin. Empty until configured. Production refuses to start without it. */
  ddiBaseUrl: (process.env.DDI_BASE_URL ?? "").replace(/\/$/, ""),
  version: "1.0.0",
};

const validation = validateRuntimeConfig({
  env: config.env,
  databaseUrl: config.databaseUrl,
  sessionSecret: config.sessionSecret,
  webhookSecret: config.webhookSecret,
  allowDemoGuest: config.allowDemoGuest,
  emailProvider: config.emailProvider,
  smtpUrl: config.smtpUrl,
  smtpFrom: config.smtpFrom,
  mediaSigningSecret: config.mediaSigningSecret,
  mediaRoot: config.mediaRoot,
  digiCoreBaseUrl: config.digiCoreBaseUrl,
  ddiBaseUrl: config.ddiBaseUrl,
  internalProvisionToken: config.internalProvisionToken,
  primitivesServiceToken: config.primitivesServiceToken,
  primitivesMode: config.primitivesMode,
  stagingAccessToken: config.stagingAccessToken,
});

if (isDeployedEnv(config.env) && !config.skipProductionAssert) {
  assertProductionSafe(validation);
} else if (validation.warnings.length && config.env !== "test") {
  for (const w of validation.warnings) console.warn(`[config] ${w}`);
}

export { validation as configValidation };
