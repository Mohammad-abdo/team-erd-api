import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as tasksController from "./tasks.controller.js";

const r = Router();

r.use(requireAuth);

r.get("/board", tasksController.getBoard);
r.get("/stats", tasksController.getStats);
r.get("/progress", tasksController.getProgress);

export default r;
