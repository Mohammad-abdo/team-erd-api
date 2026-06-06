/** @typedef {import("@prisma/client").Prisma.JsonValue} JsonValue */

export const NOTIFICATION_PREF_DEFAULTS = {
  schemaChange: true,
  schemaDrift: true,
  commentMention: true,
  commentReply: true,
  taskAssigned: true,
  dailyTaskAssigned: true,
  projectInvite: true,
  projectAdded: true,
};

/** Maps notification.type → user preference key */
export const NOTIFICATION_TYPE_TO_PREF = {
  schema_change: "schemaChange",
  schema_drift: "schemaDrift",
  comment_mention: "commentMention",
  comment_reply: "commentReply",
  TASK_ASSIGNED: "taskAssigned",
  DAILY_TASK_ASSIGNED: "dailyTaskAssigned",
  project_invite: "projectInvite",
  project_added: "projectAdded",
};

/**
 * @param {JsonValue | null | undefined} stored
 * @returns {typeof NOTIFICATION_PREF_DEFAULTS}
 */
export function mergeNotificationPrefs(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { ...NOTIFICATION_PREF_DEFAULTS };
  }
  const input = /** @type {Record<string, unknown>} */ (stored);
  const merged = { ...NOTIFICATION_PREF_DEFAULTS };
  for (const key of Object.keys(NOTIFICATION_PREF_DEFAULTS)) {
    if (typeof input[key] === "boolean") {
      merged[key] = input[key];
    }
  }
  return merged;
}

/**
 * @param {JsonValue | null | undefined} stored
 * @param {Record<string, boolean | undefined>} patch
 */
export function patchNotificationPrefs(stored, patch) {
  const current = mergeNotificationPrefs(stored);
  for (const [key, value] of Object.entries(patch)) {
    if (key in NOTIFICATION_PREF_DEFAULTS && typeof value === "boolean") {
      current[key] = value;
    }
  }
  return current;
}

/**
 * @param {JsonValue | null | undefined} stored
 * @param {string} notificationType
 */
export function shouldNotify(stored, notificationType) {
  const prefKey = NOTIFICATION_TYPE_TO_PREF[notificationType];
  if (!prefKey) return true;
  const prefs = mergeNotificationPrefs(stored);
  return prefs[prefKey] !== false;
}
