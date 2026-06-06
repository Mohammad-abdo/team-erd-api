export const DB_PROFILE_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
  "custom",
];

export function normalizeDbProfileEnvironment(value) {
  const env = String(value ?? "development").trim().toLowerCase();
  if (!env) return "development";
  if (DB_PROFILE_ENVIRONMENTS.includes(env)) return env;
  return "custom";
}

export function environmentSortKey(env) {
  const order = DB_PROFILE_ENVIRONMENTS.indexOf(env);
  return order >= 0 ? order : DB_PROFILE_ENVIRONMENTS.length;
}
