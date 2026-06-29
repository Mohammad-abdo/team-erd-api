import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { getTestSettings } from "../apiDocs/apiDocs.service.js";

const HISTORY_LIMIT = 500;
const PROXY_TIMEOUT_MS = 30000;

function collectVariables(testSettings) {
  const vars = {
    baseUrl: testSettings.baseUrl ?? "",
    authToken: testSettings.authToken ?? "",
  };

  const active = testSettings.environments?.find((e) => e.id === testSettings.activeEnvironment)
    ?? testSettings.environments?.[0];

  if (active) {
    if (active.baseUrl) vars.baseUrl = active.baseUrl;
    if (active.authToken) vars.authToken = active.authToken;

    if (active.variables && typeof active.variables === "object" && !Array.isArray(active.variables)) {
      Object.assign(vars, active.variables);
    }
    if (Array.isArray(active.variables)) {
      for (const entry of active.variables) {
        if (entry?.key) vars[entry.key] = entry.value ?? "";
      }
    }
  }

  return vars;
}

export function substituteVariables(value, vars) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key] ?? "");
    }
    return `{{${key}}}`;
  });
}

function substituteDeep(value, vars) {
  if (typeof value === "string") return substituteVariables(value, vars);
  if (Array.isArray(value)) return value.map((item) => substituteDeep(item, vars));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substituteDeep(v, vars)]),
    );
  }
  return value;
}

function buildAuthHeaders(authType, authConfig = {}, vars = {}) {
  const headers = {};
  const type = (authType ?? "none").toLowerCase();

  if (type === "bearer") {
    const token = substituteVariables(authConfig.token ?? vars.authToken ?? "", vars);
    if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  } else if (type === "basic") {
    const user = substituteVariables(authConfig.username ?? "", vars);
    const pass = substituteVariables(authConfig.password ?? "", vars);
    if (user || pass) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    }
  } else if (type === "apikey") {
    const key = substituteVariables(authConfig.key ?? "", vars);
    const val = substituteVariables(authConfig.value ?? "", vars);
    if (key && val) {
      const location = (authConfig.in ?? "header").toLowerCase();
      if (location === "query") {
        return { headers, query: { [key]: val } };
      }
      headers[key] = val;
    }
  }

  return { headers, query: {} };
}

function resolveUrl(rawUrl, baseUrl, vars) {
  const substituted = substituteVariables(rawUrl, vars);
  if (/^https?:\/\//i.test(substituted)) return substituted;
  const base = substituteVariables(baseUrl ?? "", vars).replace(/\/$/, "");
  const path = substituted.startsWith("/") ? substituted : `/${substituted}`;
  return `${base}${path}`;
}

const PRIVATE_IP_RE = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
];

function validateProxyTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "Only http and https URLs are allowed");
  }
  if (PRIVATE_IP_RE.some((r) => r.test(parsed.hostname))) {
    throw new HttpError(400, "Requests to private or internal addresses are not allowed");
  }
}

async function pruneHistory(projectId, userId) {
  const stale = await prisma.apiRequestHistory.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "desc" },
    skip: HISTORY_LIMIT,
    select: { id: true },
  });
  if (!stale.length) return;
  await prisma.apiRequestHistory.deleteMany({
    where: { id: { in: stale.map((r) => r.id) } },
  });
}

async function saveHistory(projectId, userId, entry) {
  const row = await prisma.apiRequestHistory.create({
    data: {
      projectId,
      userId,
      method: entry.method,
      url: entry.url,
      requestJson: entry.requestJson,
      responseJson: entry.responseJson,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
    },
  });
  await pruneHistory(projectId, userId);
  return row;
}

function normalizeHeaders(input) {
  if (!input) return {};
  if (Array.isArray(input)) {
    return Object.fromEntries(
      input
        .filter((h) => h?.key)
        .map((h) => [h.key, h.value ?? ""]),
    );
  }
  if (typeof input === "object") return { ...input };
  return {};
}

function parseResponseBody(text, contentType) {
  if (!text) return null;
  if (contentType?.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export async function executeProxy(projectId, userId, input) {
  const testSettings = await getTestSettings(projectId, userId);
  const vars = collectVariables(testSettings);

  const method = (input.method ?? "GET").toUpperCase();
  const url = resolveUrl(input.url, input.baseUrl ?? testSettings.baseUrl, vars);
  validateProxyTarget(url); // block SSRF to private/internal addresses
  const auth = buildAuthHeaders(input.authType, input.authConfig, vars);

  let headers = {
    ...normalizeHeaders(testSettings.headers),
    ...normalizeHeaders(input.headers),
    ...auth.headers,
  };
  headers = substituteDeep(headers, vars);

  let finalUrl = url;
  if (auth.query && Object.keys(auth.query).length) {
    const parsed = new URL(finalUrl);
    for (const [k, v] of Object.entries(auth.query)) {
      parsed.searchParams.set(k, v);
    }
    finalUrl = parsed.toString();
  }

  let body = input.body;
  if (body !== undefined && body !== null && body !== "") {
    if (typeof body === "object") {
      body = JSON.stringify(substituteDeep(body, vars));
    } else {
      body = substituteVariables(String(body), vars);
    }
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  } else {
    body = undefined;
  }

  const requestJson = {
    method,
    url: finalUrl,
    headers,
    body: body ?? null,
    authType: input.authType ?? "none",
    authConfig: input.authConfig ?? null,
  };

  const startMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await fetch(finalUrl, {
      method,
      headers,
      body: ["GET", "HEAD", "DELETE"].includes(method) ? undefined : body,
      signal: controller.signal,
    });

    const durationMs = Date.now() - startMs;
    const contentType = res.headers.get("content-type") ?? "";
    const responseText = await res.text();
    const responseBody = parseResponseBody(responseText, contentType);

    const responseHeaders = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const responseJson = {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      body: responseBody,
      ok: res.ok,
    };

    const history = await saveHistory(projectId, userId, {
      method,
      url: finalUrl,
      requestJson,
      responseJson,
      statusCode: res.status,
      durationMs,
    });

    return {
      request: requestJson,
      response: responseJson,
      durationMs,
      historyId: history.id,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const message = err.name === "AbortError"
      ? "Request timed out"
      : (err.message ?? "Network error");

    const responseJson = {
      status: 0,
      statusText: "Network Error",
      headers: {},
      body: message,
      ok: false,
      error: message,
    };

    const history = await saveHistory(projectId, userId, {
      method,
      url: finalUrl,
      requestJson,
      responseJson,
      statusCode: null,
      durationMs,
    });

    return {
      request: requestJson,
      response: responseJson,
      durationMs,
      historyId: history.id,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function listHistory(projectId, userId, { limit = 50 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), HISTORY_LIMIT);
  const items = await prisma.apiRequestHistory.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return items;
}

export async function runCollection(projectId, userId, { requests = [] } = {}) {
  if (!Array.isArray(requests) || !requests.length) {
    throw new HttpError(400, "requests array is required");
  }

  const results = [];
  for (const req of requests) {
    const result = await executeProxy(projectId, userId, req);
    results.push({
      label: req.label ?? null,
      ...result,
    });
  }

  const succeeded = results.filter((r) => r.response.ok).length;
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  };
}

async function assertRouteInProject(projectId, routeId) {
  const route = await prisma.apiRoute.findFirst({
    where: { id: routeId, group: { projectId } },
    include: {
      group: { select: { prefix: true } },
      parameters: true,
    },
  });
  if (!route) throw new HttpError(404, "API route not found");
  return route;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export async function generateRouteCurl(projectId, userId, routeId, overrides = {}) {
  const route = await assertRouteInProject(projectId, routeId);
  const testSettings = await getTestSettings(projectId, userId);
  const vars = collectVariables(testSettings);

  let fullPath = `${route.group.prefix ?? ""}${route.path}`;
  for (const param of route.parameters.filter((p) => p.location === "PATH")) {
    const example = overrides.path?.[param.name] ?? param.example ?? `{{${param.name}}}`;
    fullPath = fullPath.replace(`:${param.name}`, substituteVariables(example, vars));
    fullPath = fullPath.replace(`{${param.name}}`, substituteVariables(example, vars));
  }

  const url = resolveUrl(fullPath, overrides.baseUrl ?? testSettings.baseUrl, vars);
  const parsedUrl = new URL(url);

  for (const param of route.parameters.filter((p) => p.location === "QUERY")) {
    const example = overrides.query?.[param.name] ?? param.example;
    if (example) parsedUrl.searchParams.set(param.name, substituteVariables(example, vars));
  }

  const authType = overrides.authType ?? (route.authRequired ? "bearer" : "none");
  const auth = buildAuthHeaders(authType, overrides.authConfig, vars);

  const headers = {
    ...normalizeHeaders(testSettings.headers),
    ...auth.headers,
  };
  for (const param of route.parameters.filter((p) => p.location === "HEADER")) {
    if (param.example) headers[param.name] = substituteVariables(param.example, vars);
  }
  if (overrides.headers) Object.assign(headers, normalizeHeaders(overrides.headers));

  const method = route.method;
  const parts = [`curl -X ${method}`, shellEscape(parsedUrl.toString())];

  for (const [key, value] of Object.entries(headers)) {
    if (value) parts.push(`-H ${shellEscape(`${key}: ${value}`)}`);
  }

  const body = overrides.body ?? testSettings.body;
  if (body && !["GET", "DELETE", "HEAD"].includes(method)) {
    const bodyStr = typeof body === "string" ? substituteVariables(body, vars) : JSON.stringify(substituteDeep(body, vars));
    parts.push(`-d ${shellEscape(bodyStr)}`);
  }

  return {
    routeId: route.id,
    method: route.method,
    url: parsedUrl.toString(),
    curl: parts.join(" \\\n  "),
  };
}
