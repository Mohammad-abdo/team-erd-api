import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as dailyTasksController from "./daily-tasks.controller.js";

const r = Router();

r.use(requireAuth);

r.get("/today", dailyTasksController.listMine);
r.get("/stats", dailyTasksController.getMyStats);

export default r;
