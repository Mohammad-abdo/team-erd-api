/** Pure role → permission defaults (no Prisma client import — safe for unit tests). */

const ROLE_DEFAULTS = {
  LEADER: null,
  EDITOR: {
    ERD: ["VIEW", "CREATE", "EDIT", "DELETE"],
    API: ["VIEW", "CREATE", "EDIT", "DELETE"],
    COMMENTS: ["VIEW", "CREATE", "EDIT", "DELETE"],
    EXPORTS: ["VIEW", "CREATE", "EDIT"],
    TASKS: ["VIEW", "CREATE", "EDIT", "DELETE"],
  },
  VIEWER: {
    ERD: ["VIEW"],
    API: ["VIEW"],
    COMMENTS: ["VIEW"],
    EXPORTS: ["VIEW"],
    TASKS: ["VIEW"],
  },
  COMMENTER: {
    ERD: ["VIEW"],
    API: ["VIEW"],
    COMMENTS: ["VIEW", "CREATE", "EDIT"],
    EXPORTS: ["VIEW"],
    TASKS: ["VIEW"],
  },
};

export function roleAllowsAction(role, resource, action) {
  if (role === "LEADER") {
    return true;
  }
  const defaults = ROLE_DEFAULTS[role];
  return defaults?.[resource]?.includes(action) ?? false;
}

export function actionRank(action) {
  const ranks = { VIEW: 1, CREATE: 2, EDIT: 3, DELETE: 4 };
  return ranks[action] ?? 0;
}

export function minActionForRole(minimumRole) {
  if (minimumRole === "VIEWER" || minimumRole === "COMMENTER") {
    return "VIEW";
  }
  if (minimumRole === "EDITOR") {
    return "EDIT";
  }
  return "DELETE";
}
