import { lookup } from "dns/promises";
import { isIP } from "net";
import { HttpError } from "../utils/httpError.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function isPrivateIpv4(octets) {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(addr) {
  const normalized = addr.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (normalized.startsWith("fe80")) return true; // link-local
  return false;
}

export function isPrivateIpAddress(ip) {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateIpv4(ip.split(".").map(Number));
  }
  if (version === 6) {
    return isPrivateIpv6(ip);
  }
  return false;
}

function normalizeHostname(host) {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) {
    h = h.slice(1, -1);
  }
  return h;
}

export function isBlockedHostname(hostname) {
  const h = normalizeHostname(hostname);
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (isIP(h)) return isPrivateIpAddress(h);
  return false;
}

async function resolveHostAddresses(hostname) {
  const h = normalizeHostname(hostname);
  if (isIP(h)) return [h];
  try {
    const results = await lookup(h, { all: true });
    return results.map((r) => r.address);
  } catch {
    return [];
  }
}

/**
 * Reject hosts/URLs that could reach internal infrastructure.
 * @param {string} hostOrUrl — hostname or full URL
 * @param {{ requireHttps?: boolean }} [opts]
 */
export async function assertSafeOutboundTarget(hostOrUrl, opts = {}) {
  let hostname;
  let protocol;

  try {
    const parsed = new URL(hostOrUrl.includes("://") ? hostOrUrl : `http://${hostOrUrl}`);
    hostname = parsed.hostname;
    protocol = parsed.protocol;
  } catch {
    throw new HttpError(400, "Invalid host or URL");
  }

  if (opts.requireHttps && protocol !== "https:") {
    throw new HttpError(400, "HTTPS is required for outbound URLs in production");
  }

  if (isBlockedHostname(hostname)) {
    throw new HttpError(400, "Target host is not allowed");
  }

  const addresses = await resolveHostAddresses(hostname);
  if (!addresses.length) {
    throw new HttpError(400, "Could not resolve target host");
  }

  for (const addr of addresses) {
    if (isPrivateIpAddress(addr)) {
      throw new HttpError(400, "Target host resolves to a private or internal address");
    }
  }
}

export async function assertSafeDatabaseHost(host) {
  const allowPrivate =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_PRIVATE_DB_HOSTS === "1";
  if (allowPrivate) {
    const h = normalizeHostname(host);
    if (!h) {
      throw new HttpError(400, "Invalid host");
    }
    return;
  }
  await assertSafeOutboundTarget(host, { requireHttps: false });
}

/** @deprecated Use assertSafeDatabaseHost — kept for existing imports */
export const assertSafeMysqlHost = assertSafeDatabaseHost;

export async function assertSafeWebhookUrl(url) {
  const requireHttps = process.env.NODE_ENV === "production";
  await assertSafeOutboundTarget(url, { requireHttps });
}
