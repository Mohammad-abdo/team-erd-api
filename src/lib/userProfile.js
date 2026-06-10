import { PlatformRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { serializeClientAccess } from "./clientPortal.js";
import { mergeNotificationPrefs } from "./notificationPrefs.js";
import { normalizeAvatarUrl } from "./avatarUpload.js";

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  platformRole: true,
  isActive: true,
  createdAt: true,
};

export async function enrichUserProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...userPublicSelect,
      teamMemberships: {
        include: {
          team: { select: { id: true, name: true, slug: true, color: true, icon: true } },
        },
      },
    },
  });
  if (!user) return null;
  const { teamMemberships, ...rest } = user;

  const { notificationPrefs, ...publicRest } = rest;
  const profile = {
    ...publicRest,
    avatar: normalizeAvatarUrl(publicRest.avatar),
    notificationPrefs: mergeNotificationPrefs(notificationPrefs),
    teams: teamMemberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      slug: m.team.slug,
      color: m.team.color,
      icon: m.team.icon,
      role: m.role,
    })),
  };

  if (user.platformRole === PlatformRole.CLIENT) {
    const rows = await prisma.clientProjectAccess.findMany({
      where: { userId },
      include: {
        project: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { project: { name: "asc" } },
    });
    profile.clientProjects = rows.map((row) => ({
      projectId: row.projectId,
      projectName: row.project.name,
      projectSlug: row.project.slug,
      access: serializeClientAccess(row),
    }));
    profile.teams = [];
  }

  return profile;
}

export { userPublicSelect };
