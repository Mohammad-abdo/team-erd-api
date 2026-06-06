import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";
import { getRateLimitBackend, getRateLimitStore } from "../lib/rateLimitStore.js";

const skipInDev = () => !config.isProd;

function createLimiter({ max, windowMs = 15 * 60 * 1000, message, keyGenerator }) {
  const store = getRateLimitStore();
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: message ?? { error: "Too many requests — try again later" },
    skip: skipInDev,
    keyGenerator: keyGenerator ?? ((req) => req.ip),
    ...(store ? { store } : {}),
  });
}

/** Drift + DB introspect — per authenticated user. */
export const expensiveDbLimiter = createLimiter({
  max: config.rateLimits.expensiveDbMax,
  message: { error: "Too many database operations — try again in a few minutes" },
  keyGenerator: (req) => `${req.user?.sub ?? req.ip}:expensive-db`,
});

/** Login brute-force guard — per IP, short window. */
export const loginLimiter = createLimiter({
  max: config.rateLimits.loginMax,
  windowMs: config.rateLimits.loginWindowMs,
  message: { error: "Too many login attempts — try again shortly" },
  keyGenerator: (req) => `${req.ip}:login`,
});

/** Password reset email abuse guard — per IP. */
export const forgotPasswordLimiter = createLimiter({
  max: config.rateLimits.forgotPasswordMax,
  windowMs: config.rateLimits.forgotPasswordWindowMs,
  message: { error: "Too many password reset requests — try again later" },
  keyGenerator: (req) => `${req.ip}:forgot-password`,
});

/** OpenAI / schema AI routes — per authenticated user. */
export const aiLimiter = createLimiter({
  max: config.rateLimits.aiMax,
  message: { error: "Too many AI requests — try again in a few minutes" },
  keyGenerator: (req) => `${req.user?.sub ?? req.ip}:ai`,
});

/** Project export downloads — per authenticated user. */
export const exportLimiter = createLimiter({
  max: config.rateLimits.exportMax,
  message: { error: "Too many export requests — try again in a few minutes" },
  keyGenerator: (req) => `${req.user?.sub ?? req.ip}:export`,
});

/** Admin backup export — per admin user. */
export const adminBackupLimiter = createLimiter({
  max: config.rateLimits.adminBackupMax,
  windowMs: config.rateLimits.adminBackupWindowMs,
  message: { error: "Too many backup exports — try again later" },
  keyGenerator: (req) => `${req.user?.sub ?? req.ip}:admin-backup`,
});

function windowLabel(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** Read-only catalog for admin console (env-tunable limits). */
export function getRateLimitCatalog() {
  const globalMax = config.isProd ? 300 : 3000;
  const authMax = config.isProd ? 30 : 300;

  return [
    {
      id: "global",
      scope: "ip",
      window: windowLabel(15 * 60 * 1000),
      max: globalMax,
      routes: ["All /api/* (after health checks)"],
      note: "Safety net for every API request",
    },
    {
      id: "auth",
      scope: "ip",
      window: windowLabel(15 * 60 * 1000),
      max: authMax,
      routes: ["/api/auth/*"],
      note: "Shared bucket for register, refresh, reset, etc.",
    },
    {
      id: "login",
      scope: "ip",
      window: windowLabel(config.rateLimits.loginWindowMs),
      max: config.rateLimits.loginMax,
      routes: ["POST /api/auth/login"],
      env: "RATE_LIMIT_LOGIN_MAX, RATE_LIMIT_LOGIN_WINDOW_MS",
    },
    {
      id: "forgot-password",
      scope: "ip",
      window: windowLabel(config.rateLimits.forgotPasswordWindowMs),
      max: config.rateLimits.forgotPasswordMax,
      routes: ["POST /api/auth/forgot-password"],
      env: "RATE_LIMIT_FORGOT_PASSWORD_MAX, RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS",
    },
    {
      id: "expensive-db",
      scope: "user",
      window: windowLabel(15 * 60 * 1000),
      max: config.rateLimits.expensiveDbMax,
      routes: [
        "POST …/import/introspect/mysql/preview",
        "POST …/import/introspect/mysql",
        "POST …/import/introspect/postgres/preview",
        "POST …/import/introspect/postgres",
        "POST …/import/drift/mysql",
        "POST …/import/drift/postgres",
      ],
      env: "RATE_LIMIT_EXPENSIVE_DB_MAX",
    },
    {
      id: "ai",
      scope: "user",
      window: windowLabel(15 * 60 * 1000),
      max: config.rateLimits.aiMax,
      routes: ["POST /api/projects/:projectId/ai/*"],
      env: "RATE_LIMIT_AI_MAX",
    },
    {
      id: "export",
      scope: "user",
      window: windowLabel(15 * 60 * 1000),
      max: config.rateLimits.exportMax,
      routes: ["GET /api/projects/:projectId/export/*"],
      env: "RATE_LIMIT_EXPORT_MAX",
    },
    {
      id: "admin-backup",
      scope: "admin",
      window: windowLabel(config.rateLimits.adminBackupWindowMs),
      max: config.rateLimits.adminBackupMax,
      routes: ["GET /api/admin/backup"],
      env: "RATE_LIMIT_ADMIN_BACKUP_MAX, RATE_LIMIT_ADMIN_BACKUP_WINDOW_MS",
    },
  ];
}
