import { prisma } from "../../lib/prisma.js";
import { deliverNotification } from "../../lib/notify.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function processExpiredAccess() {
  const now = new Date();
  const warnBefore = new Date(now.getTime() + 7 * DAY_MS);

  const [expiringMembers, expiringClients, expiredMembers, expiredClients] = await Promise.all([
    prisma.projectMember.findMany({
      where: { expiresAt: { gt: now, lte: warnBefore } },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, leaderId: true } },
      },
    }),
    prisma.clientProjectAccess.findMany({
      where: { expiresAt: { gt: now, lte: warnBefore } },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, leaderId: true } },
      },
    }),
    prisma.projectMember.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, projectId: true, userId: true },
    }),
    prisma.clientProjectAccess.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, projectId: true, userId: true },
    }),
  ]);

  if (expiredMembers.length) {
    await prisma.projectMember.deleteMany({
      where: { id: { in: expiredMembers.map((m) => m.id) } },
    });
  }
  if (expiredClients.length) {
    await prisma.clientProjectAccess.deleteMany({
      where: { id: { in: expiredClients.map((c) => c.id) } },
    });
  }

  for (const row of expiringMembers) {
    await deliverNotification({
      userId: row.userId,
      type: "access_expiring",
      title: "Project access expiring soon",
      body: `Your access to ${row.project.name} expires on ${row.expiresAt.toLocaleDateString()}`,
      data: { projectId: row.projectId },
    });
    if (row.project.leaderId) {
      await deliverNotification({
        userId: row.project.leaderId,
        type: "access_expiring",
        title: "Member access expiring",
        body: `${row.user.name}'s access to ${row.project.name} expires soon`,
        data: { projectId: row.projectId, userId: row.userId },
      });
    }
  }

  for (const row of expiringClients) {
    await deliverNotification({
      userId: row.userId,
      type: "access_expiring",
      title: "Client access expiring soon",
      body: `Your client access to ${row.project.name} expires on ${row.expiresAt.toLocaleDateString()}`,
      data: { projectId: row.projectId },
    });
  }

  return {
    expiredMembers: expiredMembers.length,
    expiredClients: expiredClients.length,
    warnings: expiringMembers.length + expiringClients.length,
  };
}
