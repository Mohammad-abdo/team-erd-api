import { prisma } from "../../lib/prisma.js";

export async function listActivityFeed(projectId, { limit = 50 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);

  return prisma.activityLog.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });
}
