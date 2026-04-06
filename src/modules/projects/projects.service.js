import { ProjectMemberRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { slugify } from "../../utils/slug.js";
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

export async function listProjectsForUser(userId) {
  return prisma.project.findMany({
    where: {
      OR: [{ leaderId: userId }, { members: { some: { userId } } }],
    },
    orderBy: { createdAt: "desc" },
    include: projectDashboardInclude(userId),
  });
}

export async function createProject(userId, input) {
  const slug = await uniqueSlug(input.name);

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name: input.name.trim(),
        slug,
        description: input.description?.trim() ?? null,
        visibility: input.visibility,
        leaderId: userId,
      },
    });

    await tx.projectMember.create({
      data: {
        projectId: p.id,
        userId,
        role: ProjectMemberRole.LEADER,
      },
    });

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
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ leaderId: userId }, { members: { some: { userId } } }],
    },
    include: projectDashboardInclude(userId),
  });

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  return project;
}

export async function updateProject(projectId, userId, input) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, leaderId: userId },
  });
  if (!project) {
    throw new HttpError(403, "Only the leader can update this project");
  }

  const oldValues = {
    name: project.name,
    description: project.description,
    visibility: project.visibility,
  };

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && {
        description: input.description === null ? null : input.description.trim(),
      }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
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
  const project = await prisma.project.findFirst({
    where: { id: projectId, leaderId: userId },
  });
  if (!project) {
    throw new HttpError(403, "Only the leader can delete this project");
  }

  emitToProject(projectId, "project:deleted", { at: Date.now() });

  await prisma.project.delete({ where: { id: projectId } });
}
