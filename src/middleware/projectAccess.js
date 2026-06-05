import { PermissionAction, PermissionResource, ProjectMemberRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hasMinRole } from "../lib/permissions.js";
import { hasProjectPermission } from "../lib/projectPermissions.js";

/**
 * Loads `req.project` (without full members array) and `req.projectMember` for the current user.
 * Expects `req.params.projectId` and `req.user.sub`.
 */
export const loadProjectMember = asyncHandler(async (req, _res, next) => {
  const userId = req.user.sub;
  const projectId = req.params.projectId;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        where: { userId },
        take: 1,
      },
    },
  });

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  let member = project.members[0];
  if (!member) {
    const teamAccess = await prisma.teamProject.findFirst({
      where: {
        projectId,
        team: { members: { some: { userId } } },
      },
    });
    if (!teamAccess) {
      throw new HttpError(403, "Not a project member");
    }
    member = {
      id: `team-${teamAccess.teamId}`,
      projectId,
      userId,
      role: ProjectMemberRole.VIEWER,
      invitedById: null,
      joinedAt: teamAccess.assignedAt,
    };
  }

  const { members, ...rest } = project;
  req.project = rest;
  req.projectMember = member;
  next();
});

/**
 * @param {import("@prisma/client").ProjectMemberRole} minimumRole
 */
export function requireProjectRole(minimumRole) {
  return (req, _res, next) => {
    if (!hasMinRole(req.projectMember.role, minimumRole)) {
      return next(new HttpError(403, "Insufficient permissions"));
    }
    next();
  };
}

export function requireProjectLeader(req, _res, next) {
  if (req.project.leaderId !== req.user.sub) {
    return next(new HttpError(403, "Only the project leader can do this"));
  }
  next();
}

/**
 * @param {import("@prisma/client").PermissionResource} resource
 * @param {import("@prisma/client").PermissionAction} action
 */
export function requireProjectPermission(resource, action) {
  return asyncHandler(async (req, _res, next) => {
    const allowed = await hasProjectPermission(
      req.user.sub,
      req.params.projectId,
      req.projectMember.role,
      resource,
      action,
    );
    if (!allowed) {
      return next(new HttpError(403, "Insufficient permissions"));
    }
    next();
  });
}

export { PermissionResource, PermissionAction };
