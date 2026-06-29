import { Router } from "express";
import { z } from "zod";
import { PlatformRole, TeamRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { requireOrgAdmin } from "../../middleware/adminAccess.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as invitationsService from "./invitations.service.js";

const r = Router();

const createInvitationSchema = z.object({
  email: z.string().email(),
  platformRole: z.nativeEnum(PlatformRole).optional(),
  teamId: z.string().min(1).optional(),
  teamRole: z.nativeEnum(TeamRole).optional(),
  organizationId: z.string().min(1).optional(),
});

const tokenQuerySchema = z.object({
  token: z.string().min(16),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(16),
});

const registerInvitationSchema = z.object({
  token: z.string().min(16),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(128),
});

r.get(
  "/preview",
  validate(tokenQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const data = await invitationsService.previewOrganizationInvitation(req.query.token);
    res.json(data);
  }),
);

r.post(
  "/register",
  validate(registerInvitationSchema),
  asyncHandler(async (req, res) => {
    const result = await invitationsService.registerViaOrganizationInvitation(req.body);
    res.status(201).json(result);
  }),
);

r.post(
  "/accept",
  requireAuth,
  validate(acceptInvitationSchema),
  asyncHandler(async (req, res) => {
    const user = await invitationsService.acceptOrganizationInvitation({
      userId: req.user.sub,
      userEmail: req.user.email,
      token: req.body.token,
    });
    res.json(user);
  }),
);

r.post(
  "/",
  requireAuth,
  requireOrgAdmin,
  validate(createInvitationSchema),
  asyncHandler(async (req, res) => {
    const invitation = await invitationsService.createOrganizationInvitation(
      req.user.sub,
      req.body,
    );
    res.status(201).json({ invitation });
  }),
);

r.get(
  "/",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const data = await invitationsService.listOrganizationInvitations(req.user.sub);
    res.json(data);
  }),
);

r.delete(
  "/:id",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await invitationsService.revokeOrganizationInvitation(req.user.sub, req.params.id);
    res.status(204).end();
  }),
);

export default r;
