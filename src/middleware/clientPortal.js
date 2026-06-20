import { PermissionAction, PermissionResource } from "@prisma/client";
import { HttpError } from "../utils/httpError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hasProjectPermission } from "../lib/projectPermissions.js";
import {
  clientViewKeyForResource,
  getClientAccessRecord,
  isPlatformClient,
  serializeClientAccess,
} from "../lib/clientPortal.js";

export const blockClientPlatform = asyncHandler(async (req, _res, next) => {
  if (await isPlatformClient(req.user.sub)) {
    return next(new HttpError(403, "Not available for client portal accounts"));
  }
  next();
});

/** Allow client portal users when the route param matches their own user id. */
export const blockClientPlatformUnlessSelf = asyncHandler(async (req, _res, next) => {
  if (req.params.userId === req.user.sub) {
    return next();
  }
  return blockClientPlatform(req, _res, next);
});

export function blockClientUsers(req, _res, next) {
  if (req.isClientUser) {
    return next(new HttpError(403, "Not available for client portal accounts"));
  }
  next();
}

export function requireClientReportAccess(req, _res, next) {
  if (!req.isClientUser) return next();
  if (!req.clientAccess?.report) {
    return next(new HttpError(403, "Project report is not available for your account"));
  }
  next();
}

export function requireClientOverviewAccess(req, _res, next) {
  if (!req.isClientUser) return next();
  if (!req.clientAccess?.overview) {
    return next(new HttpError(403, "Project overview is not available for your account"));
  }
  next();
}

export function requireClientHealthAccess(req, _res, next) {
  if (!req.isClientUser) return next();
  if (!req.clientAccess?.health) {
    return next(new HttpError(403, "Project health is not available for your account"));
  }
  next();
}

export function enforceClientReadOnly(req, _res, next) {
  if (!req.isClientUser) return next();
  if (req.clientAccess) return next();
  return next(new HttpError(403, "No client access to this project"));
}

export function enforceClientPermission(resource, action) {
  return (req, _res, next) => {
    if (!req.isClientUser) return next();

    if (action !== PermissionAction.VIEW) {
      return next(new HttpError(403, "Client accounts have read-only access"));
    }

    if (resource === PermissionResource.EXPORTS) {
      return next(new HttpError(403, "Exports are not available for client accounts"));
    }

    const viewKey = clientViewKeyForResource(resource);
    if (viewKey && !req.clientAccess?.[viewKey]) {
      return next(new HttpError(403, "This section is not available for your account"));
    }

    next();
  };
}

export const requireDriftReadAccess = asyncHandler(async (req, _res, next) => {
  if (req.isClientUser) {
    if (req.clientAccess?.overview || req.clientAccess?.health) {
      return next();
    }
    throw new HttpError(403, "Schema status is not available for your account");
  }

  const allowed = await hasProjectPermission(
    req.user.sub,
    req.params.projectId,
    req.projectMember.role,
    PermissionResource.ERD,
    PermissionAction.VIEW,
  );
  if (!allowed) {
    throw new HttpError(403, "Insufficient permissions");
  }
  next();
});

export async function attachClientAccessToRequest(req, projectId, userId) {
  if (!(await isPlatformClient(userId))) {
    req.isClientUser = false;
    req.clientAccess = null;
    return;
  }

  const access = await getClientAccessRecord(userId, projectId);
  if (!access) {
    throw new HttpError(403, "No client access to this project");
  }
  if (access.expiresAt && access.expiresAt < new Date()) {
    throw new HttpError(403, "Client access to this project has expired");
  }

  req.isClientUser = true;
  req.clientAccess = serializeClientAccess(access);
}
