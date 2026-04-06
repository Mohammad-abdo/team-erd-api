import { ProjectMemberRole } from "@prisma/client";

const RANK = {
  [ProjectMemberRole.VIEWER]: 1,
  [ProjectMemberRole.COMMENTER]: 2,
  [ProjectMemberRole.EDITOR]: 3,
  [ProjectMemberRole.LEADER]: 4,
};

export function roleRank(role) {
  return RANK[role] ?? 0;
}

export function hasMinRole(role, minimum) {
  return roleRank(role) >= roleRank(minimum);
}
