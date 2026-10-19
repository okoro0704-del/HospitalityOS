/**
 * Environment validation — production must not start with unsafe defaults.
 */
export type AppEnv = "development" | "test" | "production";

export function resolveAppEnv(): AppEnv {
  const raw = (process.env.HOS_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "test") return "test";
  return "development";
}

const UNSAFE_SECRETS = new Set([
  "dev-only-session-secret-change-me",
  "dev-only-webhook-secret",
  "changeme",
  "secret",
  "password",
  "test",
  "test-secret",
  // Shipped as the default service token here and in sibling Digiconomy repos.
  "dev-primitives-token",
]);

export type ConfigValidationResult = {
  env: AppEnv;
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateRuntimeConfig(opts: {
  env: AppEnv;
  databaseUrl: string;
  sessionSecret: string;
  webhookSecret: string;
  allowDemoGuest: boolean;
  emailProvider?: string;
  smtpUrl?: string;
  smtpFrom?: string;
  mediaSigningSecret?: string;
  mediaRoot?: string;
  digiCoreBaseUrl?: string;
  ddiBaseUrl?: string;
  internalProvisionToken?: string;
  primitivesServiceToken?: string;
  primitivesMode?: string;
}): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { env } = opts;

  if (env === "production") {
    if (!opts.databaseUrl || opts.databaseUrl.startsWith("file:")) {
      errors.push("Production requires PostgreSQL DATABASE_URL (sqlite file: URLs are forbidden)");
    } else if (!opts.databaseUrl.startsWith("postgresql://") && !opts.databaseUrl.startsWith("postgres://")) {
      errors.push("Production DATABASE_URL must be a postgresql:// or postgres:// connection string");
    }

    if (!opts.sessionSecret || UNSAFE_SECRETS.has(opts.sessionSecret) || opts.sessionSecret.length < 32) {
      errors.push("Production SESSION_SECRET must be a strong secret (≥32 chars, not a default)");
    }
    if (!opts.webhookSecret || UNSAFE_SECRETS.has(opts.webhookSecret) || opts.webhookSecret.length < 16) {
      errors.push("Production WEBHOOK_SECRET must be set to a non-default value");
    }
    if (opts.allowDemoGuest) {
      errors.push("Production must set ALLOW_DEMO_GUEST=false");
    }
    if (opts.emailProvider === "mock" || !opts.emailProvider || opts.emailProvider === "console") {
      errors.push("Production EMAIL_PROVIDER must be smtp (mock/console forbidden)");
    }
    if (opts.emailProvider === "smtp" && !opts.smtpUrl) {
      errors.push("Production EMAIL_PROVIDER=smtp requires SMTP_URL");
    }
    if (opts.emailProvider === "smtp" && (!opts.smtpFrom || opts.smtpFrom.includes("hospitalityos.local"))) {
      errors.push("Production SMTP_FROM must be set to a real sender identity");
    }
    if (!opts.mediaSigningSecret || opts.mediaSigningSecret.length < 32 || UNSAFE_SECRETS.has(opts.mediaSigningSecret)) {
      errors.push("Production MEDIA_SIGNING_SECRET must be a strong secret (≥32 chars)");
    }
    if (!opts.mediaRoot) {
      errors.push("Production MEDIA_ROOT must be set for private media storage");
    }
    if (!opts.digiCoreBaseUrl) {
      errors.push("Production DIGI_CORE_BASE_URL is required for Digi Core");
    }
    if (!opts.ddiBaseUrl) {
      errors.push("Production DDI_BASE_URL is required for Personal Digital Infrastructure");
    }
    // /internal/distributor/provision trusts this bearer to create tenants and owner accounts.
    if (
      !opts.internalProvisionToken ||
      UNSAFE_SECRETS.has(opts.internalProvisionToken) ||
      opts.internalProvisionToken.length < 32
    ) {
      errors.push("Production INTERNAL_PROVISION_TOKEN must be a strong secret (≥32 chars, not a default)");
    }
    if (
      !opts.primitivesServiceToken ||
      UNSAFE_SECRETS.has(opts.primitivesServiceToken) ||
      opts.primitivesServiceToken.length < 32
    ) {
      errors.push("Production PRIMITIVES_SERVICE_TOKEN must be a strong secret (≥32 chars, not a default)");
    }
    // Local primitives are in-process stand-ins: the FundzMan one reports payments as
    // settled without moving money, so invoices would be marked paid falsely.
    if (opts.primitivesMode !== "remote") {
      errors.push("Production requires PRIMITIVES_MODE=remote (local stand-ins fake payments and messaging)");
    }
  } else if (env === "development") {
    if (opts.sessionSecret && UNSAFE_SECRETS.has(opts.sessionSecret)) {
      warnings.push("Using development default SESSION_SECRET — never deploy this configuration");
    }
  }

  return { env, ok: errors.length === 0, errors, warnings };
}

export function assertProductionSafe(result: ConfigValidationResult) {
  for (const w of result.warnings) {
    console.warn(`[config] ${w}`);
  }
  if (!result.ok) {
    const msg = [
      "HospitalityOS refused to start: unsafe production configuration.",
      ...result.errors.map((e) => `  - ${e}`),
      "See docs/PRODUCTION_DEPLOYMENT.md",
    ].join("\n");
    throw new Error(msg);
  }
}
