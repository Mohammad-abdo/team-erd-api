const MENTION_TOKEN_RE = /@\[([^\]]+)\]\(mention:([a-zA-Z0-9_-]+)\)/g;

/** Build a mention token inserted by the composer autocomplete. */
export function buildMentionToken(user) {
  const name = String(user.name ?? user.email ?? "user").trim();
  return `@[${name}](mention:${user.id})`;
}

/**
 * Extract unique user IDs from mention tokens in comment body.
 * @param {string} body
 * @returns {string[]}
 */
export function extractMentionUserIds(body) {
  if (!body?.trim()) return [];
  const ids = new Set();
  for (const match of body.matchAll(MENTION_TOKEN_RE)) {
    if (match[2]) ids.add(match[2]);
  }
  return [...ids];
}

/**
 * Keep only mentions that belong to the project member set.
 * @param {string} body
 * @param {Set<string>} allowedUserIds
 */
export function filterMentionsToMembers(body, allowedUserIds) {
  return extractMentionUserIds(body).filter((id) => allowedUserIds.has(id));
}
