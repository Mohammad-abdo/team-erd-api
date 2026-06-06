import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  loadProjectMember,
  requireProjectPermission,
  PermissionResource,
  PermissionAction,
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

const tasksView = requireProjectPermission(PermissionResource.TASKS, PermissionAction.VIEW);
const tasksCreate = requireProjectPermission(PermissionResource.TASKS, PermissionAction.CREATE);
const tasksEdit = requireProjectPermission(PermissionResource.TASKS, PermissionAction.EDIT);
const tasksDelete = requireProjectPermission(PermissionResource.TASKS, PermissionAction.DELETE);

r.get("/", tasksView, tasksController.listProjectTasks);
r.post("/", tasksCreate, validate(createTaskSchema), tasksController.createTask);
r.get("/:taskId", tasksView, tasksController.getTask);
r.patch("/:taskId", tasksEdit, validate(updateTaskSchema), tasksController.updateTask);
r.delete("/:taskId", tasksDelete, tasksController.deleteTask);
r.post("/:taskId/progress", tasksEdit, validate(logProgressSchema), tasksController.logProgress);
r.get("/:taskId/progress", tasksView, tasksController.listProgress);

export default r;
