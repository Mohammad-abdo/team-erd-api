import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { validate } from "../../middleware/validate.js";
import * as orgService from "./organizations.service.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireSuperAdmin } from "../../middleware/adminAccess.js";
import { requireOrgAdmin } from "../../middleware/adminAccess.js";

const r = Router();

r.post(
  "/register",
  validate(orgService.registerOrganizationSchema),
  asyncHandler(async (req, res) => {
    const result = await orgService.registerOrganization(req.body);
    res.status(201).json(result);
  }),
);

r.post(
  "/team-accounts",
  requireAuth,
  requireOrgAdmin,
  validate(orgService.createTeamAccountSchema),
  asyncHandler(async (req, res) => {
    const result = await orgService.createTeamAccount(req.user.sub, req.body);
    res.status(201).json(result);
  }),
);

r.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const organizations = await orgService.listOrganizationsForSuperAdmin();
    res.json({ organizations });
  }),
);

r.get(
  "/:orgId",
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const organization = await orgService.getOrganization(req.params.orgId);
    res.json({ organization });
  }),
);

export default r;
