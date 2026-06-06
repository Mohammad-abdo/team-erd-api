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

export const config = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", undefined),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  jwt: {
    accessSecret: jwtSecret("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
    refreshSecret: jwtSecret("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "7d",
  },
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
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
