import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { isOrgAdmin, isPlatformAdmin } from "../../middleware/adminAccess.js";
import { isTeamLeadOverUser, getManagedTeamIds } from "../../lib/teamHierarchy.js";
import { getMemberProfile } from "../members/members.service.js";
import { getTaskStats } from "../tasks/tasks.service.js";

export async function getProgressInsights(viewerId, targetUserId) {
  if (viewerId !== targetUserId) {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { platformRole: true, organizationId: true },
    });
    const admin = await isPlatformAdmin(viewerId);
    const orgAdmin = await isOrgAdmin(viewerId);
    if (!admin && !orgAdmin && !(await isTeamLeadOverUser(viewerId, targetUserId, viewer))) {
      throw new HttpError(403, "You do not have access to this progress data");
    }
  }

  const [profile, stats] = await Promise.all([
    getMemberProfile(viewerId, targetUserId).catch(() => null),
    getTaskStats(targetUserId, { assigneeId: targetUserId }).catch(() => null),
  ]);

  return {
    userId: targetUserId,
    summary: profile?.workReport?.summary ?? null,
    taskStats: stats,
    ratings: profile?.ratings?.slice(0, 3) ?? [],
    dailyTasksWeek: profile?.workReport?.dailyTaskBreakdown ?? null,
  };
}

export async function getTeamProgressInsights(viewerId) {
  const user = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { platformRole: true, organizationId: true },
  });
  const managedTeamIds = await getManagedTeamIds(viewerId, user);
  if (!managedTeamIds.length) {
    throw new HttpError(403, "Team lead or admin access required");
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: managedTeamIds } },
    select: { userId: true, user: { select: { id: true, name: true, avatar: true } } },
    distinct: ["userId"],
  });

  const rows = await Promise.all(
    members
      .filter((m) => m.userId !== viewerId)
      .map(async (m) => {
        const insights = await getProgressInsights(viewerId, m.userId).catch(() => null);
        return insights ? { user: m.user, ...insights } : null;
      }),
  );

  return rows.filter(Boolean);
}
