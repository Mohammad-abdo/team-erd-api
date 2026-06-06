const PATH_STOPWORDS = new Set([
  "api",
  "v1",
  "v2",
  "v3",
  "auth",
  "public",
  "internal",
  "admin",
]);

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function tableNameVariants(name) {
  const n = normalizeName(name);
  if (!n) return [];
  const variants = new Set([n]);
  if (n.endsWith("ies")) {
    variants.add(`${n.slice(0, -3)}y`);
  }
  if (n.endsWith("s") && n.length > 1) {
    variants.add(n.slice(0, -1));
  } else {
    variants.add(`${n}s`);
  }
  return [...variants];
}

function buildTableIndex(tables) {
  const byName = new Map();
  for (const table of tables) {
    byName.set(normalizeName(table.name), table);
  }
  return byName;
}

function resolveTableName(candidate, tableIndex) {
  for (const variant of tableNameVariants(candidate)) {
    const table = tableIndex.get(variant);
    if (table) return table;
  }
  return null;
}

export function extractPathResourceNames(path) {
  const segments = String(path ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith(":"));

  const names = [];
  for (const segment of segments) {
    const normalized = normalizeName(segment);
    if (!normalized || PATH_STOPWORDS.has(normalized)) continue;
    names.push(normalized);
  }
  return names;
}

function extractFromExampleJson(exampleJson) {
  const names = new Set();
  if (!exampleJson) return names;

  let parsed = exampleJson;
  if (typeof exampleJson === "string") {
    try {
      parsed = JSON.parse(exampleJson);
    } catch {
      return names;
    }
  }

  if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
    parsed = parsed[0];
  }

  if (parsed && typeof parsed === "object") {
    for (const key of Object.keys(parsed)) {
      const n = normalizeName(key);
      if (n && n.length > 2 && !["id", "data", "meta", "error", "message"].includes(n)) {
        names.add(n);
      }
    }
  }

  return names;
}

/**
 * @param {{ tables: { id: string, name: string, label?: string }[] }} erd
 * @param {{ id: string, method: string, path: string, group?: { prefix?: string }, parameters?: object[], responses?: object[], erdLinks?: { erdTableId: string, erdTable?: { name: string } }[] }[]} routes
 */
export function analyzeApiErdSync(erdTables, routes) {
  const tableIndex = buildTableIndex(erdTables);
  const issues = [];
  let linkedRouteCount = 0;

  for (const route of routes) {
    const linkedIds = new Set((route.erdLinks ?? []).map((l) => l.erdTableId));
    if (linkedIds.size > 0) linkedRouteCount += 1;

    const candidates = new Set();
    for (const segment of extractPathResourceNames(route.path)) {
      candidates.add(segment);
    }

    for (const param of route.parameters ?? []) {
      if (param.location === "BODY" && param.name) {
        candidates.add(normalizeName(param.name));
      }
    }

    for (const resp of route.responses ?? []) {
      for (const name of extractFromExampleJson(resp.exampleJson)) {
        candidates.add(name);
      }
    }

    const inferredTables = new Map();
    for (const candidate of candidates) {
      const table = resolveTableName(candidate, tableIndex);
      if (table) {
        inferredTables.set(table.id, table);
      } else if (candidate.length > 2 && !PATH_STOPWORDS.has(candidate)) {
        const looksLikeResource =
          route.path.toLowerCase().includes(candidate.replace(/_/g, "-"))
          || route.path.toLowerCase().includes(candidate)
          || (route.parameters ?? []).some((p) => normalizeName(p.name) === candidate);

        if (looksLikeResource) {
          issues.push({
            type: "unknown_table",
            severity: "warning",
            routeId: route.id,
            method: route.method,
            path: route.path,
            tableName: candidate,
            message: `Route ${route.method} ${route.path} may reference unknown table "${candidate}"`,
          });
        }
      }
    }

    if (inferredTables.size === 0 && linkedIds.size === 0 && routes.length > 0) {
      issues.push({
        type: "no_erd_links",
        severity: "info",
        routeId: route.id,
        method: route.method,
        path: route.path,
        message: `Route ${route.method} ${route.path} has no linked ERD tables`,
      });
      continue;
    }

    for (const [tableId, table] of inferredTables) {
      if (!linkedIds.has(tableId)) {
        issues.push({
          type: "missing_erd_link",
          severity: "warning",
          routeId: route.id,
          method: route.method,
          path: route.path,
          tableName: table.name,
          erdTableId: table.id,
          message: `Route ${route.method} ${route.path} touches "${table.name}" but is not linked on the API docs`,
        });
      }
    }

    for (const link of route.erdLinks ?? []) {
      const linkedName = link.erdTable?.name ?? link.erdTableId;
      const pathResources = extractPathResourceNames(route.path);
      const pathMatches = pathResources.some((r) => resolveTableName(r, tableIndex)?.id === link.erdTableId);
      if (!pathMatches && inferredTables.size > 0 && !inferredTables.has(link.erdTableId)) {
        issues.push({
          type: "weak_link",
          severity: "info",
          routeId: route.id,
          method: route.method,
          path: route.path,
          tableName: linkedName,
          erdTableId: link.erdTableId,
          message: `Route ${route.method} ${route.path} is linked to "${linkedName}" but the path does not obviously match`,
        });
      }
    }
  }

  const routeCount = routes.length;
  const coveragePercent = routeCount
    ? Math.round((linkedRouteCount / routeCount) * 100)
    : 0;

  return {
    summary: {
      erdTables: erdTables.length,
      routes: routeCount,
      routesWithLinks: linkedRouteCount,
      coveragePercent,
      issueCount: issues.length,
      unknownTables: issues.filter((i) => i.type === "unknown_table").length,
      missingLinks: issues.filter((i) => i.type === "missing_erd_link").length,
    },
    issues,
  };
}
