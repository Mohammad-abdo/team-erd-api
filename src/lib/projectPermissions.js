import { PermissionAction, PermissionResource, ProjectMemberRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { hasMinRole } from "./permissions.js";

const ROLE_DEFAULTS = {
  [ProjectMemberRole.LEADER]: null,
  [ProjectMemberRole.EDITOR]: {
    [PermissionResource.ERD]: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
    [PermissionResource.API]: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
    [PermissionResource.COMMENTS]: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
    [PermissionResource.EXPORTS]: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
  },
  [ProjectMemberRole.VIEWER]: {
    [PermissionResource.ERD]: [PermissionAction.VIEW],
    [PermissionResource.API]: [PermissionAction.VIEW],
    [PermissionResource.COMMENTS]: [PermissionAction.VIEW],
    [PermissionResource.EXPORTS]: [PermissionAction.VIEW],
  },
  [ProjectMemberRole.COMMENTER]: {
    [PermissionResource.ERD]: [PermissionAction.VIEW],
    [PermissionResource.API]: [PermissionAction.VIEW],
    [PermissionResource.COMMENTS]: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT],
    [PermissionResource.EXPORTS]: [PermissionAction.VIEW],
  },
};

export function roleAllowsAction(role, resource, action) {
  if (role === ProjectMemberRole.LEADER) {
    return true;
  }
  const defaults = ROLE_DEFAULTS[role];
  return defaults?.[resource]?.includes(action) ?? false;
}

export async function hasProjectPermission(userId, projectId, role, resource, action) {
  if (role === ProjectMemberRole.LEADER) {
    return true;
  }
  const grant = await prisma.projectPermission.findUnique({
    where: {
      projectId_userId_resource_action: {
        projectId,
        userId,
        resource,
        action,
      },
    },
  });
  if (grant) {
    return true;
  }
  return roleAllowsAction(role, resource, action);
}

export function actionRank(action) {
  const ranks = {
    [PermissionAction.VIEW]: 1,
    [PermissionAction.CREATE]: 2,
    [PermissionAction.EDIT]: 3,
    [PermissionAction.DELETE]: 4,
  };
  return ranks[action] ?? 0;
}

export function minActionForRole(minimumRole) {
  if (minimumRole === ProjectMemberRole.VIEWER || minimumRole === ProjectMemberRole.COMMENTER) {
    return PermissionAction.VIEW;
  }
  if (minimumRole === ProjectMemberRole.EDITOR) {
    return PermissionAction.EDIT;
  }
  return PermissionAction.DELETE;
}

export function hasMinRoleOrPermission(role, minimumRole) {
  return hasMinRole(role, minimumRole);
}
