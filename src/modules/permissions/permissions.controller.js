import { asyncHandler } from "../../utils/asyncHandler.js";
import * as permissionsService from "./permissions.service.js";

export const list = asyncHandler(async (req, res) => {
  const permissions = await permissionsService.listPermissions(req.params.projectId);
  res.json({ permissions });
});

export const grant = asyncHandler(async (req, res) => {
  const permission = await permissionsService.grantPermission({
    projectId: req.params.projectId,
    leaderId: req.user.sub,
    ...req.body,
  });
  res.status(201).json({ permission });
});

export const revoke = asyncHandler(async (req, res) => {
  await permissionsService.revokePermission({
    projectId: req.params.projectId,
    leaderId: req.user.sub,
    ...req.body,
  });
  res.status(204).end();
});
