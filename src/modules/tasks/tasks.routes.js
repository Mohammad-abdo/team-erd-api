import { Router } from "express";
import { ProjectMemberRole } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectRole,
} from "../../middleware/projectAccess.js";
import {
  createTaskSchema,
  logProgressSchema,
  updateTaskSchema,
} from "./tasks.schemas.js";
import * as tasksController from "./tasks.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);

const viewer = requireProjectRole(ProjectMemberRole.VIEWER);
const editor = requireProjectRole(ProjectMemberRole.EDITOR);

r.get("/", viewer, tasksController.listProjectTasks);
r.post("/", editor, validate(createTaskSchema), tasksController.createTask);
r.get("/:taskId", viewer, tasksController.getTask);
r.patch("/:taskId", editor, validate(updateTaskSchema), tasksController.updateTask);
r.delete("/:taskId", editor, tasksController.deleteTask);
r.post("/:taskId/progress", editor, validate(logProgressSchema), tasksController.logProgress);
r.get("/:taskId/progress", viewer, tasksController.listProgress);

export default r;
