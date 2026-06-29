import { z } from "zod";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  loadProjectMember,
  requireProjectPermission,
  PermissionResource,
  PermissionAction,
} from "../../middleware/projectAccess.js";
import * as apiStudioService from "./apiStudio.service.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const apiView = requireProjectPermission(PermissionResource.API, PermissionAction.VIEW);

const proxySchema = z.object({
  method: z.string().min(1).max(10).optional(),
  url: z.string().min(1).max(2000),
  baseUrl: z.string().max(500).optional(),
  headers: z.union([z.record(z.string()), z.array(z.object({ key: z.string(), value: z.string().optional() }))]).optional(),
  body: z.union([z.string(), z.record(z.unknown()), z.array(z.unknown())]).optional(),
  authType: z.enum(["none", "bearer", "basic", "apikey", "oauth2"]).optional(),
  authConfig: z.record(z.unknown()).optional(),
});

const runSchema = z.object({
  requests: z.array(proxySchema.extend({
    label: z.string().max(200).optional(),
  })).min(1).max(50),
});

r.post(
  "/proxy",
  apiView,
  validate(proxySchema),
  asyncHandler(async (req, res) => {
    const result = await apiStudioService.executeProxy(
      req.params.projectId,
      req.user.sub,
      req.body,
    );
    res.json(result);
  }),
);

r.get(
  "/history",
  apiView,
  asyncHandler(async (req, res) => {
    const items = await apiStudioService.listHistory(
      req.params.projectId,
      req.user.sub,
      { limit: req.query.limit },
    );
    res.json({ items });
  }),
);

r.post(
  "/run",
  apiView,
  validate(runSchema),
  asyncHandler(async (req, res) => {
    const summary = await apiStudioService.runCollection(
      req.params.projectId,
      req.user.sub,
      req.body,
    );
    res.json(summary);
  }),
);

r.get(
  "/routes/:routeId/code",
  apiView,
  asyncHandler(async (req, res) => {
    const code = await apiStudioService.generateRouteCurl(
      req.params.projectId,
      req.user.sub,
      req.params.routeId,
      {
        baseUrl: req.query.baseUrl,
        authType: req.query.authType,
        body: req.query.body,
      },
    );
    res.json(code);
  }),
);

export default r;
