import "dotenv/config";

const required = (key, fallback) => {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing env: ${key}`);
  }
  return v;
};

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

function jwtSecret(key, devFallback) {
  const v = process.env[key];
  if (v && v.trim() !== "") {
    if (isProd && (v.includes("change-me") || v.includes("dev-"))) {
      throw new Error(`${key} must be changed for production`);
    }
    return v;
  }
  if (isProd) {
    throw new Error(`Missing env: ${key}`);
  }
  return devFallback;
}

function parseBool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

function dbProfileEncryptionKey() {
  const v = process.env.DB_PROFILE_ENCRYPTION_KEY?.trim();
  if (v) return v;
  if (isProd) {
    throw new Error("Missing env: DB_PROFILE_ENCRYPTION_KEY");
  }
  return "dev-db-profile-encryption-key-change-me";
}

function parseCorsOrigins(raw) {
  const origins = (raw ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!isProd) {
    for (const extra of [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ]) {
      if (!origins.includes(extra)) origins.push(extra);
    }
  }
  return origins;
}

export const config = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", undefined),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  allowPublicRegistration: parseBool(process.env.ALLOW_PUBLIC_REGISTRATION, !isProd),
  jwt: {
    accessSecret: jwtSecret("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
    refreshSecret: jwtSecret("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "7d",
  },
  corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),
  weeklyDigestCron: parseBool(process.env.WEEKLY_DIGEST_CRON, false),
  weeklyDigestCronUtcHour: Number(process.env.WEEKLY_DIGEST_CRON_UTC_HOUR ?? 8),
  weeklyDigestCronUtcDay: Number(process.env.WEEKLY_DIGEST_CRON_UTC_DAY ?? 1),
  driftCheckCron: parseBool(process.env.DRIFT_CHECK_CRON, false),
  dbProfileEncryptionKey: dbProfileEncryptionKey(),
  sentryDsn: process.env.SENTRY_DSN?.trim() || null,
  rateLimits: {
    expensiveDbMax: Number(process.env.RATE_LIMIT_EXPENSIVE_DB_MAX ?? (isProd ? 20 : 200)),
  },
  smtp: {
    host: process.env.SMTP_HOST?.trim() || null,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim() || null,
    pass: process.env.SMTP_PASS?.trim() || null,
    from: process.env.SMTP_FROM?.trim() || "DBForge <noreply@localhost>",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY?.trim() || null,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  },
};
