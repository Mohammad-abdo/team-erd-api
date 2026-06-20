import { asyncHandler } from "../../utils/asyncHandler.js";
import * as accessRequestsService from "./accessRequests.service.js";

export const create = asyncHandler(async (req, res) => {
  const request = await accessRequestsService.createAccessRequest({
    projectId: req.params.projectId,
    userId: req.user.sub,
    requestedRole: req.body.requestedRole,
    message: req.body.message,
  });
  res.status(201).json({ request });
});

export const listForProject = asyncHandler(async (req, res) => {
  const requests = await accessRequestsService.listProjectAccessRequests(
    req.params.projectId,
    req.user.sub,
  );
  res.json({ requests });
});

export const review = asyncHandler(async (req, res) => {
  const request = await accessRequestsService.reviewAccessRequest({
    requestId: req.params.requestId,
    actorId: req.actorId ?? req.user.sub,
    status: req.body.status,
  });
  res.json({ request });
});
