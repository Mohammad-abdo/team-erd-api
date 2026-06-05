import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";

export async function getPublicProjectBySlug(slug) {
  const project = await prisma.project.findFirst({
    where: { slug, visibility: "PUBLIC" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      visibility: true,
      healthStage: true,
      updatedAt: true,
      leader: { select: { name: true } },
      _count: {
        select: {
          erdTables: true,
          erdRelations: true,
          members: true,
          comments: true,
        },
      },
      erdTables: {
        orderBy: { name: "asc" },
        take: 50,
        select: {
          id: true,
          name: true,
          _count: { select: { columns: true, relationsFrom: true } },
        },
      },
      apiGroups: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          routes: {
            orderBy: { path: "asc" },
            take: 30,
            select: { id: true, method: true, path: true, summary: true, status: true },
          },
        },
      },
    },
  });

  if (!project) {
    throw new HttpError(404, "Public project not found");
  }

  const apiRouteCount = project.apiGroups.reduce((n, g) => n + g.routes.length, 0);

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      visibility: project.visibility,
      healthStage: project.healthStage,
      updatedAt: project.updatedAt,
      leader: project.leader,
      counts: {
        erdTables: project._count.erdTables,
        erdRelations: project._count.erdRelations,
        members: project._count.members,
        comments: project._count.comments,
        apiRoutes: apiRouteCount,
      },
      erdTables: project.erdTables.map((t) => ({
        id: t.id,
        name: t.name,
        columnCount: t._count.columns,
        relationCount: t._count.relationsFrom,
      })),
      apiGroups: project.apiGroups.map((g) => ({
        id: g.id,
        name: g.name,
        routes: g.routes,
      })),
    },
  };
}
