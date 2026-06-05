import { prisma } from "../../lib/prisma.js";
import { isPlatformAdmin } from "../../middleware/adminAccess.js";

export async function globalSearch(userId, query) {
  const q = query.trim();
  if (q.length < 2) return { projects: [], tables: [], routes: [], users: [], teams: [] };

  const admin = await isPlatformAdmin(userId);

  const projectWhere = admin
    ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }
    : {
        AND: [
          { OR: [{ name: { contains: q } }, { slug: { contains: q } }] },
          {
            OR: [
              { leaderId: userId },
              { members: { some: { userId } } },
              { teamProjects: { some: { team: { members: { some: { userId } } } } } } },
            ],
          },
        ],
      };

  const [projects, tables, routes, teams] = await Promise.all([
    prisma.project.findMany({
      where: projectWhere,
      take: 10,
      select: { id: true, name: true, slug: true },
    }),
    prisma.erdTable.findMany({
      where: {
        name: { contains: q },
        project: admin
          ? undefined
          : {
              OR: [
                { leaderId: userId },
                { members: { some: { userId } } },
                { teamProjects: { some: { team: { members: { some: { userId } } } } } } },
              ],
            },
      },
      take: 10,
      select: { id: true, name: true, projectId: true, project: { select: { name: true, slug: true } } },
    }),
    prisma.apiRoute.findMany({
      where: {
        OR: [{ path: { contains: q } }, { summary: { contains: q } }],
        group: {
          project: admin
            ? undefined
            : {
                OR: [
                  { leaderId: userId },
                  { members: { some: { userId } } },
                  { teamProjects: { some: { team: { members: { some: { userId } } } } } } },
                ],
              },
        },
      },
      take: 10,
      select: {
        id: true,
        method: true,
        path: true,
        summary: true,
        group: { select: { projectId: true, project: { select: { name: true, slug: true } } } },
      },
    }),
    prisma.team.findMany({
      where: admin
        ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }
        : {
            AND: [
              { OR: [{ name: { contains: q } }, { slug: { contains: q } }] },
              { members: { some: { userId } } },
            ],
          },
      take: 10,
      select: { id: true, name: true, slug: true, color: true },
    }),
  ]);

  let users = [];
  if (admin) {
    users = await prisma.user.findMany({
      where: { OR: [{ name: { contains: q } }, { email: { contains: q } }] },
      take: 10,
      select: { id: true, name: true, email: true },
    });
  }

  return { projects, tables, routes, teams, users };
}
