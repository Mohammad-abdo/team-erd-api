import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as progressService from "./progress.service.js";

const r = Router();

r.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const insights = await progressService.getProgressInsights(req.user.sub, req.user.sub);
    res.json({ insights });
  }),
);

r.get(
  "/team",
  requireAuth,
  asyncHandler(async (req, res) => {
    const members = await progressService.getTeamProgressInsights(req.user.sub);
    res.json({ members });
  }),
);

r.get(
  "/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const insights = await progressService.getProgressInsights(req.user.sub, req.params.userId);
    res.json({ insights });
  }),
);

export default r;
