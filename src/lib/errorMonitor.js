import { config } from "../config/index.js";

/**
 * Structured server error log. Set SENTRY_DSN in production to forward to an external monitor.
 */
export function captureServerError(err, context = {}) {
  const payload = {
    level: "error",
    service: "dbforge-api",
    message: err?.message ?? "Unknown error",
    name: err?.name ?? "Error",
    status: err?.status ?? err?.statusCode ?? 500,
    sentryConfigured: Boolean(config.sentryDsn),
    ...context,
    ...(config.isProd ? {} : { stack: err?.stack }),
  };

  console.error(JSON.stringify(payload));
}
