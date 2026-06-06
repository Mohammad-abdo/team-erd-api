import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { loadProjectMember, requireProjectLeader } from "../../middleware/projectAccess.js";
import { createWebhookSchema, updateWebhookSchema } from "./webhooks.schemas.js";
import * as webhooksController from "./webhooks.controller.js";

const r = Router({ mergeParams: true });

r.use(requireAuth);
r.use(loadProjectMember);
r.use(requireProjectLeader);

r.get("/", webhooksController.list);
r.post("/", validate(createWebhookSchema), webhooksController.create);
r.patch("/:webhookId", validate(updateWebhookSchema), webhooksController.update);
r.delete("/:webhookId", webhooksController.remove);
r.post("/:webhookId/test", webhooksController.test);

export default r;
