import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireOrgAdmin } from "../../middleware/adminAccess.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { exportLimiter } from "../../middleware/rateLimits.js";
import * as exportService from "./export.service.js";

const r = Router();

r.use(requireAuth, requireOrgAdmin, exportLimiter);

const entityQuerySchema = z.object({
  format: z.enum(["csv", "json"]).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  teamId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
});

r.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await exportService.exportOrganizationFull(req.user.sub);
    res.json(data);
  }),
);

r.get(
  "/:entity",
  validate(entityQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const result = await exportService.exportOrganizationEntity(
      req.user.sub,
      req.params.entity,
      {
        format: req.query.format,
        month: req.query.month,
        teamId: req.query.teamId,
        userId: req.query.userId,
      },
    );

    if (result.format === "csv") {
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", `attachment; filename=${result.filename}`);
      res.send(result.body);
      return;
    }

    res.json(result.body);
  }),
);

export default r;
