import { PlatformRole, ProjectMemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { getUserOrganizationId, DEFAULT_ORG_ID, orgWhereClause, userIsOrgAdmin } from "../../lib/orgScope.js";
import { getManagerTeamIds } from "../../lib/teamHierarchy.js";
import { emitToProject } from "../../sockets/emit.js";
import { logActivity } from "../activity/activity.service.js";

async function uniqueSlug(base) {
  let slug = slugify(base);
  for (let i = 0; i < 20; i += 1) {
    const taken = await prisma.project.findUnique({ where: { slug } });
    if (!taken) {
      return slug;
    }
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  throw new HttpError(500, "Could not allocate slug");
}

async function assertCanManageProject(projectId, userId) {
  const [project, user] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        leaderId: true,
        organizationId: true,
        teamProjects: { select: { teamId: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true, organizationId: true },
    }),
  ]);
  if (!project) throw new HttpError(404, "Project not found");
  if (!user) throw new HttpError(403, "Forbidden");

  if (project.leaderId === userId) return project;

  if (user.platformRole === PlatformRole.SUPER_ADMIN) return project;

  if (
    userIsOrgAdmin(user)
    && (user.organizationId ?? DEFAULT_ORG_ID) === (project.organizationId ?? DEFAULT_ORG_ID)
  ) {
    return project;
  }

  const managerTeamIds = await getManagerTeamIds(userId);
  const projectTeamIds = project.teamProjects.map((tp) => tp.teamId);
  if (projectTeamIds.some((tid) => managerTeamIds.includes(tid))) {
    return project;
  }

  throw new HttpError(403, "Only the project leader or a team manager can modify this project");
}

const projectDashboardInclude = (userId) => ({
  leader: {
    select: { id: true, name: true, email: true, avatar: true },
  },
  members: {
    where: { userId },
    take: 1,
  },
  _count: {
    select: {
      members: true,
      erdTables: true,
      erdRelations: true,
      comments: true,
    },
  },
  activityLogs: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdAt: true },
  },
  apiGroups: {
    select: { _count: { select: { routes: true } } },
  },
});

function projectAccessWhere(userId, teamId) {
  const base = [
    { leaderId: userId },
    { members: { some: { userId } } },
    { teamProjects: { some: { team: { members: { some: { userId } } } } } },
  ];
  if (teamId) {
    return {
      AND: [
        { OR: base },
        { teamProjects: { some: { teamId } } },
      ],
    };
  }
  return { OR: base };
}

async function resolveProjectListWhere(userId, teamId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, organizationId: true },
  });
  if (user?.platformRole === PlatformRole.CLIENT) {
    return { members: { some: { userId } } };
  }
  if (userIsOrgAdmin(user)) {
    return teamId
      ? { AND: [orgWhereClause(user), { teamProjects: { some: { teamId } } }] }
      : orgWhereClause(user);
  }
  const access = projectAccessWhere(userId, teamId);
  return { AND: [orgWhereClause(user), access] };
}

export async function listProjectsForUser(userId, { teamId } = {}) {
  const where = await resolveProjectListWhere(userId, teamId);
  const isClient = (await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  }))?.platformRole === PlatformRole.CLIENT;

  return prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      ...projectDashboardInclude(userId),
      teamProjects: { include: { team: { select: { id: true, name: true, slug: true, color: true } } } },
      ...(isClient
        ? {
            clientAccess: {
              where: { userId },
              take: 1,
            },
          }
        : {}),
    },
  });
}

function defaultProjectDates(input = {}) {
  const start = input.startDate ? new Date(input.startDate) : new Date();
  start.setHours(0, 0, 0, 0);
  const deadline = input.deadline ? new Date(input.deadline) : new Date(start);
  if (!input.deadline) {
    deadline.setDate(deadline.getDate() + 30);
  }
  return { startDate: start, deadline };
}

async function resolveProjectTeamIds(userId, organizationId, inputTeamIds = []) {
  const orgId = organizationId ?? DEFAULT_ORG_ID;
  const requested = [...new Set((Array.isArray(inputTeamIds) ? inputTeamIds : []).filter(Boolean))];

  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true, organizationId: true },
    }),
    prisma.teamMember.findMany({
      where: { userId, team: { organizationId: orgId } },
      select: { teamId: true },
    }),
  ]);
  const memberTeamIds = memberships.map((row) => row.teamId);

  if (!requested.length) {
    return memberTeamIds;
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: requested }, organizationId: orgId },
    select: { id: true, organizationId: true },
  });
  const validRequested = teams.map((team) => team.id);

  if (!validRequested.length) {
    return memberTeamIds;
  }

  const isAdmin = userIsOrgAdmin(user);
  for (const team of teams) {
    if (!isAdmin && !memberTeamIds.includes(team.id)) {
      throw new HttpError(403, "You can only assign projects to teams you belong to");
    }
  }

  return validRequested;
}

export async function createProject(userId, input) {
  const slug = await uniqueSlug(input.name);
  const organizationId = await getUserOrganizationId(userId);
  const { startDate, deadline } = defaultProjectDates(input);
  const teamIds = await resolveProjectTeamIds(userId, organizationId, input.teamIds);

  const emptyUrl = (v) => (v === "" ? null : v ?? null);

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name: input.name.trim(),
        slug,
        description: input.description?.trim() ?? null,
        visibility: input.visibility,
        leaderId: userId,
        organizationId: organizationId ?? DEFAULT_ORG_ID,
        startDate,
        deadline,
        clientRequirements: input.clientRequirements?.trim() ?? null,
        examplesJson: input.examplesJson ?? null,
        deploymentAccessJson: input.deploymentAccessJson ?? null,
        figmaUrl: emptyUrl(input.figmaUrl),
        githubUrl: emptyUrl(input.githubUrl),
        liveUrl: emptyUrl(input.liveUrl),
        docsUrl: emptyUrl(input.docsUrl),
      },
    });

    await tx.projectMember.create({
      data: {
        projectId: p.id,
        userId,
        role: ProjectMemberRole.LEADER,
      },
    });

    const teamIdsToLink = teamIds;
    if (teamIdsToLink.length) {
      await tx.teamProject.createMany({
        data: teamIdsToLink.map((teamId) => ({ teamId, projectId: p.id })),
        skipDuplicates: true,
      });
    }

    return p;
  });

  await logActivity({
    projectId: project.id,
    userId,
    action: "created",
    entityType: "project",
    entityId: project.id,
    newValues: { name: project.name, slug: project.slug },
  });

  emitToProject(project.id, "project:updated", { at: Date.now() });

  return getProjectByIdForUser(project.id, userId);
}

export async function getProjectByIdForUser(projectId, userId) {
  const where = await resolveProjectListWhere(userId);
  const isClient = (await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  }))?.platformRole === PlatformRole.CLIENT;

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...where,
    },
    include: {
      ...projectDashboardInclude(userId),
      teamProjects: { include: { team: { select: { id: true, name: true, slug: true, color: true } } } },
      ...(isClient
        ? {
            clientAccess: {
              where: { userId },
              take: 1,
            },
          }
        : {}),
    },
  });

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  return project;
}

export async function updateProject(projectId, userId, input) {
  const project = await assertCanManageProject(projectId, userId);

  const oldValues = {
    name: project.name,
    description: project.description,
    visibility: project.visibility,
  };

  const urlField = (v) => (v === "" || v === null ? null : v);

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && {
        description: input.description === null ? null : input.description.trim(),
      }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.startDate !== undefined && { startDate: new Date(input.startDate) }),
      ...(input.deadline !== undefined && { deadline: new Date(input.deadline) }),
      ...(input.clientRequirements !== undefined && {
        clientRequirements: input.clientRequirements === null ? null : input.clientRequirements.trim(),
      }),
      ...(input.examplesJson !== undefined && { examplesJson: input.examplesJson }),
      ...(input.deploymentAccessJson !== undefined && { deploymentAccessJson: input.deploymentAccessJson }),
      ...(input.figmaUrl !== undefined && { figmaUrl: urlField(input.figmaUrl) }),
      ...(input.githubUrl !== undefined && { githubUrl: urlField(input.githubUrl) }),
      ...(input.liveUrl !== undefined && { liveUrl: urlField(input.liveUrl) }),
      ...(input.docsUrl !== undefined && { docsUrl: urlField(input.docsUrl) }),
    },
  });

  await logActivity({
    projectId,
    userId,
    action: "updated",
    entityType: "project",
    entityId: projectId,
    oldValues,
    newValues: {
      name: updated.name,
      description: updated.description,
      visibility: updated.visibility,
    },
  });

  emitToProject(projectId, "project:updated", { at: Date.now() });

  return getProjectByIdForUser(projectId, userId);
}

export async function deleteProject(projectId, userId) {
  await assertCanManageProject(projectId, userId);

  emitToProject(projectId, "project:deleted", { at: Date.now() });

  await prisma.project.delete({ where: { id: projectId } });
}
