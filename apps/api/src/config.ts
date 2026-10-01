export const config = {
  port: Number(process.env.HOS_PORT ?? 8800),
  host: process.env.HOS_HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5180,http://localhost:5181")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  lifeosApiUrl: process.env.LIFEOS_API_URL ?? "http://localhost:8790",
  lifeosJwksUrl:
    process.env.LIFEOS_JWKS_URL ?? "http://localhost:8790/.well-known/experience-keys",
  lifeosIssuer: process.env.LIFEOS_EXPECTED_ISSUER ?? "lifeos",
  trustidApiUrl: process.env.TRUSTID_API_URL ?? "http://localhost:8791",
  trustidJwksUrl: process.env.TRUSTID_JWKS_URL ?? "http://localhost:8791/.well-known/jwks.json",
  trustidIssuer: process.env.TRUSTID_EXPECTED_ISSUER ?? "trustid",
  trustidAudience: process.env.TRUSTID_AUDIENCE ?? "hospitalityos",
  /** Digi Core public origin. Production refuses to start when this is empty. */
  digiCoreBaseUrl: (process.env.DIGI_CORE_BASE_URL ?? "").replace(/\/$/, ""),
  /** DDI public origin. Production refuses to start when this is empty. */
  ddiBaseUrl: (process.env.DDI_BASE_URL ?? "").replace(/\/$/, ""),
  guestSessionTtlHours: 12,
  staffSessionTtlHours: 12,
  /** Demo guest entry without LifeOS — for local/dev and staged demos only. */
  allowDemoGuest: (process.env.ALLOW_DEMO_GUEST ?? "true").toLowerCase() !== "false",
  version: "1.0.0",
};

if (process.env.NODE_ENV === "production" && process.env.HOS_SKIP_PRODUCTION_ASSERT !== "true") {
  if (!config.digiCoreBaseUrl) throw new Error("Production DIGI_CORE_BASE_URL is required for Digi Core");
  if (!config.ddiBaseUrl) throw new Error("Production DDI_BASE_URL is required for Personal Digital Infrastructure");
}
