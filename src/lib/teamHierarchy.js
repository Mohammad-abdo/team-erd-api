import { TeamRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { userIsOrgAdmin, isSuperAdmin as userIsSuperAdmin } from "./orgScope.js";

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

/** Team ids where user is TEAM_LEAD (direct only). */
export async function getLeadTeamIds(userId) {
  const rows = await prisma.teamMember.findMany({
    where: { userId, role: TeamRole.TEAM_LEAD },
    select: { teamId: true },
  });
  return rows.map((r) => r.teamId);
}

/** All team ids in subtrees led by user. */
export async function getManagedTeamIds(userId, user) {
  if (userIsOrgAdmin(user)) {
    const teams = await prisma.team.findMany({
      where: user?.organizationId ? { organizationId: user.organizationId } : {},
      select: { id: true },
    });
    return teams.map((t) => t.id);
  }
  const leadIds = await getLeadTeamIds(userId);
  const managed = new Set();
  for (const tid of leadIds) {
    for (const id of await getDescendantTeamIds(tid)) {
      managed.add(id);
    }
  }
  return [...managed];
}

/** True if actor manages target user via team lead on shared managed subtree. */
export async function isTeamLeadOverUser(actorId, targetUserId, user) {
  if (actorId === targetUserId) return true;
  if (userIsOrgAdmin(user)) return true;
  const managed = await getManagedTeamIds(actorId, user);
  if (!managed.length) return false;
  const membership = await prisma.teamMember.findFirst({
    where: { userId: targetUserId, teamId: { in: managed } },
  });
  return Boolean(membership);
}
