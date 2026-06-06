import { PlatformRole, ProjectMemberRole } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Resolves direct project membership or implicit VIEWER access via team assignment.
 * @returns {Promise<{ member: object, user?: { id: string, name: string, avatar: string | null } } | null>}
 */
export async function resolveProjectMembership(projectId, userId) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
    },
  });

  if (member) {
    return { member, user: member.user };
  }

  const platformUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  if (platformUser?.platformRole === PlatformRole.CLIENT) {
    return null;
  }

  const teamAccess = await prisma.teamProject.findFirst({
    where: {
      projectId,
      team: { members: { some: { userId } } },
    },
    include: {
      team: {
        include: {
          members: {
            where: { userId },
            take: 1,
            include: {
              user: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
      },
    },
  });

  if (!teamAccess) {
    return null;
  }

  const teamUser = teamAccess.team.members[0]?.user;
  if (!teamUser) {
    return null;
  }

  return {
    member: {
      id: `team-${teamAccess.teamId}`,
      projectId,
      userId,
      role: ProjectMemberRole.VIEWER,
      invitedById: null,
      joinedAt: teamAccess.assignedAt,
    },
    user: teamUser,
  };
}
