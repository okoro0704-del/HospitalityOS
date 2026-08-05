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
  guestSessionTtlHours: 12,
  staffSessionTtlHours: 12,
  version: "1.0.0",
};
