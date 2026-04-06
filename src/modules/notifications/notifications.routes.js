import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as notificationsController from "./notifications.controller.js";

const r = Router();

r.use(requireAuth);

r.get("/", notificationsController.list);
r.post("/:id/read", notificationsController.markRead);

export default r;
