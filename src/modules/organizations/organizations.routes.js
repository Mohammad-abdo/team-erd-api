import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { validate } from "../../middleware/validate.js";
import * as orgService from "./organizations.service.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireSuperAdmin } from "../../middleware/adminAccess.js";
import { requireOrgAdmin } from "../../middleware/adminAccess.js";
import orgInvitationsRoutes from "./invitations.routes.js";
import orgExportRoutes from "./export.routes.js";
import { listOrgAccessRequests } from "../accessRequests/accessRequests.service.js";
import { orgLogoUploadHandler, getOrgLogoFile } from "../../lib/orgLogoUpload.js";
import { loadAdminActor } from "../../lib/adminScope.js";
import { DEFAULT_ORG_ID } from "../../lib/orgScope.js";
import { HttpError } from "../../utils/httpError.js";

const r = Router();

async function attachOrgLogoContext(req, _res, next) {
  try {
    const actor = await loadAdminActor(req.user.sub);
    req.orgLogoOrgId = (actor.isSuperAdmin && !actor.user.organizationId)
      ? DEFAULT_ORG_ID
      : actor.user.organizationId;
    if (!req.orgLogoOrgId) {
      return next(new HttpError(400, "Organization context required"));
    }
    next();
  } catch (err) {
    next(err);
  }
}

r.get(
  "/logos/:orgId/:filename",
  asyncHandler(async (req, res) => {
    const { abs, mime } = getOrgLogoFile(req.params.orgId, req.params.filename);
    res.type(mime);
    res.sendFile(abs);
  }),
);

r.get(
  "/me/branding",
  requireAuth,
  asyncHandler(async (req, res) => {
    const branding = await orgService.getOrgBranding(req.user.sub);
    res.json({ branding });
  }),
);

r.use("/invitations", orgInvitationsRoutes);
r.use("/export", orgExportRoutes);

r.get(
  "/me/settings",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const organization = await orgService.getOrgSettings(req.user.sub);
    res.json({ organization });
  }),
);

r.patch(
  "/me/settings",
  requireAuth,
  requireOrgAdmin,
  validate(orgService.patchOrgSettingsSchema),
  asyncHandler(async (req, res) => {
    const organization = await orgService.patchOrgSettings(req.user.sub, req.body);
    res.json({ organization });
  }),
);

r.post(
  "/me/settings/logo",
  requireAuth,
  requireOrgAdmin,
  attachOrgLogoContext,
  orgLogoUploadHandler,
  asyncHandler(async (req, res) => {
    const organization = await orgService.uploadOrgLogo(req.user.sub, req.file, req);
    res.json({ organization });
  }),
);

r.delete(
  "/me/settings/logo",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const organization = await orgService.removeOrgLogo(req.user.sub);
    res.json({ organization });
  }),
);

r.get(
  "/access-requests",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const requests = await listOrgAccessRequests(req.user.sub);
    res.json({ requests });
  }),
);

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
  "/team-accounts",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const accounts = await orgService.listTeamAccounts(req.user.sub);
    res.json({ accounts });
  }),
);

r.patch(
  "/team-accounts/:userId",
  requireAuth,
  requireOrgAdmin,
  validate(orgService.updateTeamAccountSchema),
  asyncHandler(async (req, res) => {
    const account = await orgService.updateTeamAccount(req.user.sub, req.params.userId, req.body);
    res.json({ account });
  }),
);

r.delete(
  "/team-accounts/:userId",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await orgService.deleteTeamAccount(req.user.sub, req.params.userId);
    res.status(204).end();
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
    const organization = await orgService.getOrganizationDetail(req.params.orgId);
    res.json({ organization });
  }),
);

export default r;
