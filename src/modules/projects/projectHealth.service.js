import { prisma } from "../../lib/prisma.js";
import { computeProjectHealthStage } from "./projectHealthStage.js";

export async function refreshProjectHealth(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      createdAt: true,
      lastActivityAt: true,
      _count: { select: { erdTables: true, erdRelations: true, comments: true } },
      apiGroups: { select: { _count: { select: { routes: true } } } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  if (!project) return null;

  const routeCount = project.apiGroups.reduce((sum, g) => sum + g._count.routes, 0);
  const lastActivityAt = project.activityLogs[0]?.createdAt ?? project.lastActivityAt ?? project.createdAt;

  const healthStage = computeProjectHealthStage({
    lastActivityAt,
    createdAt: project.createdAt,
    tableCount: project._count.erdTables,
    relationCount: project._count.erdRelations,
    routeCount,
    commentCount: project._count.comments,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { healthStage, lastActivityAt },
  });

  return healthStage;
}
