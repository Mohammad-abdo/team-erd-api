/**
 * Optional URL prefix when the API is served under a subpath (e.g. /team-mg/api).
 * Set API_BASE_PATH=/team-mg or API_PUBLIC_URL=https://host/team-mg/api
 */
export function parseApiBasePath(env = process.env) {
  const explicit = env.API_BASE_PATH?.trim();
  if (explicit) {
    const normalized = explicit.replace(/\/$/, "");
    if (!normalized) return "";
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }

  const publicUrl = env.API_PUBLIC_URL?.trim();
  if (publicUrl) {
    try {
      const pathname = new URL(publicUrl).pathname.replace(/\/$/, "");
      const prefix = pathname.replace(/\/api$/i, "");
      return prefix || "";
    } catch {
      return "";
    }
  }

  return "";
}

/** Prefix an absolute app path when API_BASE_PATH is configured. */
export function withApiBasePath(basePath, routePath) {
  if (!basePath) return routePath;
  return `${basePath}${routePath}`;
}
