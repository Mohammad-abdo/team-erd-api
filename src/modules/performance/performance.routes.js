import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as performanceService from "./performance.service.js";

const r = Router();

r.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const performance = await performanceService.getMyPerformance(req.user.sub, {
      month: req.query.month,
    });
    res.json({ performance });
  }),
);

r.get(
  "/team",
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await performanceService.getTeamPerformance(req.user.sub, {
      teamId: req.query.teamId,
      month: req.query.month,
    });
    res.json(summary);
  }),
);

r.get(
  "/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const performance = await performanceService.getUserPerformance(
      req.user.sub,
      req.params.userId,
      { month: req.query.month },
    );
    res.json({ performance });
  }),
);

export default r;
