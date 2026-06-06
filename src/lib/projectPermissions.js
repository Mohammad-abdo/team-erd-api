import { ProjectMemberRole } from "@prisma/client";
import { prisma } from "./prisma.js";
import { hasMinRole } from "./permissions.js";
import {
  roleAllowsAction,
  actionRank,
  minActionForRole,
} from "./rolePermissionDefaults.js";

export { roleAllowsAction, actionRank, minActionForRole };

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

export function hasMinRoleOrPermission(role, minimumRole) {
  return hasMinRole(role, minimumRole);
}
