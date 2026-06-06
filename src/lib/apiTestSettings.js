export const DEFAULT_API_ENVIRONMENTS = [
  { id: "dev", name: "Development", baseUrl: "http://localhost:3000", authToken: "" },
  { id: "staging", name: "Staging", baseUrl: "https://staging.example.com", authToken: "" },
  { id: "production", name: "Production", baseUrl: "https://api.example.com", authToken: "" },
];

/**
 * Normalize persisted or incoming API tester settings with environment profiles.
 */
export function normalizeTestSettings(row) {
  const headers = Array.isArray(row?.headers) ? row.headers : [];
  const body = row?.body ?? "";

  let environments = Array.isArray(row?.environments) && row.environments.length
    ? row.environments.map((env) => ({
        id: env.id,
        name: env.name,
        baseUrl: env.baseUrl ?? "http://localhost:3000",
        authToken: env.authToken ?? "",
      }))
    : DEFAULT_API_ENVIRONMENTS.map((env) => ({ ...env }));

  if (!row?.environments?.length && row?.baseUrl) {
    environments = environments.map((env) =>
      env.id === "dev"
        ? { ...env, baseUrl: row.baseUrl, authToken: row.authToken ?? "" }
        : env,
    );
  }

  const activeEnvironment = environments.some((e) => e.id === row?.activeEnvironment)
    ? row.activeEnvironment
    : "dev";

  const active = environments.find((e) => e.id === activeEnvironment) ?? environments[0];

  return {
    activeEnvironment: active.id,
    environments,
    baseUrl: active.baseUrl,
    authToken: active.authToken ?? "",
    headers,
    body,
  };
}

/**
 * Merge a settings patch and keep active environment in sync.
 */
export function applyTestSettingsPatch(current, patch) {
  const base = normalizeTestSettings(current);
  const next = {
    ...base,
    ...patch,
    environments: [...(patch.environments ?? base.environments)],
    headers: patch.headers ?? base.headers,
    body: patch.body ?? base.body,
  };

  if (patch.baseUrl !== undefined || patch.authToken !== undefined) {
    next.environments = next.environments.map((env) =>
      env.id === next.activeEnvironment
        ? {
            ...env,
            ...(patch.baseUrl !== undefined && { baseUrl: patch.baseUrl }),
            ...(patch.authToken !== undefined && { authToken: patch.authToken }),
          }
        : env,
    );
  }

  return normalizeTestSettings(next);
}

export function toPersistedTestSettings(normalized) {
  const active = normalized.environments.find((e) => e.id === normalized.activeEnvironment)
    ?? normalized.environments[0];

  return {
    activeEnvironment: normalized.activeEnvironment,
    environments: normalized.environments,
    baseUrl: active?.baseUrl ?? normalized.baseUrl,
    authToken: active?.authToken ?? normalized.authToken ?? "",
    headers: normalized.headers ?? [],
    body: normalized.body ?? "",
  };
}
