import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { acceptInvitationSchema } from "./invitations.schemas.js";
import * as invitationsController from "./invitations.controller.js";

const r = Router();

r.post("/accept", requireAuth, validate(acceptInvitationSchema), invitationsController.accept);

export default r;
