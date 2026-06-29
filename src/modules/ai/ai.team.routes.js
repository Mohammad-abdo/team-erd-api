import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { aiLimiter } from "../../middleware/rateLimits.js";
import { teamAssistantSchema } from "./ai.team.schemas.js";
import * as aiTeamController from "./ai.team.controller.js";

const r = Router();

r.use(requireAuth);
r.use(aiLimiter);
r.post("/assistant", validate(teamAssistantSchema), aiTeamController.teamAssistant);

export default r;
