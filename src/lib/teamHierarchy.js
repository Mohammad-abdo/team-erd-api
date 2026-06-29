import { TeamRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { userIsOrgAdmin, userIsTeamAdmin, isSuperAdmin as userIsSuperAdmin } from "./orgScope.js";

const MANAGER_ROLES = new Set([TeamRole.PROJECT_MANAGER, TeamRole.TEAM_LEAD]);

/** All team ids in subtree (including root). */
export async function getDescendantTeamIds(rootTeamId) {
  const all = await prisma.team.findMany({
    select: { id: true, parentTeamId: true },
  });
  const childrenByParent = new Map();
  for (const t of all) {
    if (!t.parentTeamId) continue;
    const list = childrenByParent.get(t.parentTeamId) ?? [];
    list.push(t.id);
    childrenByParent.set(t.parentTeamId, list);
  }
  const out = new Set([rootTeamId]);
  const queue = [rootTeamId];
  while (queue.length) {
    const id = queue.shift();
    for (const child of childrenByParent.get(id) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        queue.push(child);
      }
    }
  }
  return [...out];
}

/** Team ids where user is PROJECT_MANAGER or TEAM_LEAD (direct only). */
export async function getManagerTeamIds(userId) {
  const rows = await prisma.teamMember.findMany({
    where: {
      userId,
      role: { in: [TeamRole.PROJECT_MANAGER, TeamRole.TEAM_LEAD] },
    },
    select: { teamId: true },
  });
  return rows.map((r) => r.teamId);
}

/** @deprecated use getManagerTeamIds */
export async function getLeadTeamIds(userId) {
  return getManagerTeamIds(userId);
}

/** Team ids where user is PROJECT_MANAGER (direct only). */
export async function getProjectManagerTeamIds(userId) {
  const rows = await prisma.teamMember.findMany({
    where: { userId, role: TeamRole.PROJECT_MANAGER },
    select: { teamId: true },
  });
  return rows.map((r) => r.teamId);
}

/** All team ids in subtrees managed by user (PM or TL). */
export async function getManagedTeamIds(userId, user) {
  if (userIsOrgAdmin(user) || userIsSuperAdmin(user)) {
    const teams = await prisma.team.findMany({
      where: user?.organizationId ? { organizationId: user.organizationId } : {},
      select: { id: true },
    });
    return teams.map((t) => t.id);
  }
  if (userIsTeamAdmin(user)) {
    const leadIds = await getManagerTeamIds(userId);
    const managed = new Set();
    for (const tid of leadIds) {
      for (const id of await getDescendantTeamIds(tid)) {
        managed.add(id);
      }
    }
    return [...managed];
  }
  const leadIds = await getManagerTeamIds(userId);
  const managed = new Set();
  for (const tid of leadIds) {
    for (const id of await getDescendantTeamIds(tid)) {
      managed.add(id);
    }
  }
  return [...managed];
}

/** Resolve member user ids for managed teams. */
export async function getManagedMemberUserIds(userId, user, { teamId } = {}) {
  let teamIds = await getManagedTeamIds(userId, user);
  if (teamId) {
    if (!teamIds.includes(teamId)) return [];
    teamIds = await getDescendantTeamIds(teamId);
  }
  if (!teamIds.length) return [];
  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return members.map((m) => m.userId);
}

/** True if actor can supervise target (self, org admin, or manager over subtree). */
export async function canSuperviseUser(actorId, targetUserId, user) {
  return isTeamLeadOverUser(actorId, targetUserId, user);
}

/** True if actor manages target user via team manager role on shared managed subtree. */
export async function isTeamLeadOverUser(actorId, targetUserId, user) {
  if (actorId === targetUserId) return true;
  if (userIsOrgAdmin(user) || userIsSuperAdmin(user)) return true;
  const managed = await getManagedTeamIds(actorId, user);
  if (!managed.length) return false;
  const membership = await prisma.teamMember.findFirst({
    where: { userId: targetUserId, teamId: { in: managed } },
  });
  return Boolean(membership);
}

/** True if user has PROJECT_MANAGER on team or any ancestor team in managed subtree. */
export async function isProjectManagerOverTeam(userId, teamId) {
  const pmTeamIds = await getProjectManagerTeamIds(userId);
  for (const pmTeamId of pmTeamIds) {
    const subtree = await getDescendantTeamIds(pmTeamId);
    if (subtree.includes(teamId)) return true;
  }
  return false;
}

export function isManagerRole(role) {
  return MANAGER_ROLES.has(role);
}
