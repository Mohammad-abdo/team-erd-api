import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { patchMeSchema } from "./users.schemas.js";
import * as usersController from "./users.controller.js";

const r = Router();

r.use(requireAuth);

r.get("/me", usersController.me);
r.patch("/me", validate(patchMeSchema), usersController.patchMe);

export default r;
