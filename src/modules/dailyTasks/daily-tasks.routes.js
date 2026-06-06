import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createDailyTaskSchema, updateDailyTaskSchema } from "./daily-tasks.schemas.js";
import * as dailyTasksController from "./daily-tasks.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);

r.get("/members", dailyTasksController.getTeamMembers);
r.get("/stats", dailyTasksController.getTeamStats);
r.get("/", dailyTasksController.listTeamTasks);
r.post("/", validate(createDailyTaskSchema), dailyTasksController.create);
r.get("/:taskId", dailyTasksController.getOne);
r.patch("/:taskId", validate(updateDailyTaskSchema), dailyTasksController.update);
r.delete("/:taskId", dailyTasksController.remove);

export default r;
