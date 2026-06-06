import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createRatingSchema, createReportSchema, assignProjectSchema } from "./members.schemas.js";
import * as membersController from "./members.controller.js";

const r = Router();

r.use(requireAuth);

r.post("/reports", validate(createReportSchema), membersController.createReport);
r.get("/reports", membersController.listReports);

r.get("/teams/:teamId/directory", membersController.teamDirectory);
r.post(
  "/teams/:teamId/members/:userId/assign-project",
  validate(assignProjectSchema),
  membersController.assignToProject,
);

r.get("/:userId/profile", membersController.getProfile);
r.get("/:userId/ratings", membersController.listRatings);
r.post("/:userId/ratings", validate(createRatingSchema), membersController.createRating);

export default r;
