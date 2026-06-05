import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePlatformAdmin } from "../../middleware/adminAccess.js";
import { validate } from "../../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "./admin.schemas.js";
import * as adminController from "./admin.controller.js";

const r = Router();

r.use(requireAuth, requirePlatformAdmin);

r.get("/stats", adminController.stats);
r.get("/users", adminController.listUsers);
r.post("/users", validate(createUserSchema), adminController.createUser);
r.patch("/users/:userId", validate(updateUserSchema), adminController.updateUser);
r.get("/projects", adminController.listProjects);
r.get("/audit", adminController.auditLog);
r.get("/backup", adminController.backup);

export default r;
