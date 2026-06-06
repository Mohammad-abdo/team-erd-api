import { PermissionAction, PermissionResource } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hasMinRole } from "../lib/permissions.js";
import { hasProjectPermission } from "../lib/projectPermissions.js";
import { resolveProjectMembership } from "../lib/projectMembership.js";
import { attachClientAccessToRequest, enforceClientPermission } from "./clientPortal.js";

/**
 * Loads `req.project` (without full members array) and `req.projectMember` for the current user.
 * Expects `req.params.projectId` and `req.user.sub`.
 */
export const loadProjectMember = asyncHandler(async (req, _res, next) => {
  const userId = req.user.sub;
  const projectId = req.params.projectId;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new HttpError(404, "Project not found");
  }

  const resolved = await resolveProjectMembership(projectId, userId);
  if (!resolved) {
    throw new HttpError(403, "Not a project member");
  }

  req.project = project;
  req.projectMember = resolved.member;
  await attachClientAccessToRequest(req, projectId, userId);
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
  const clientGuard = enforceClientPermission(resource, action);
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
    clientGuard(req, _res, next);
  });
}

export { PermissionResource, PermissionAction };
