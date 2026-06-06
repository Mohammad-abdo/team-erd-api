import { Router } from "express";
import { getPortfolioReport } from "./report.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { blockClientPlatform } from "../../middleware/clientPortal.js";

const router = Router();

/* Mounted at /api/report — keeps /api free so other /api/* routers dispatch normally. */
router.get("/portfolio", requireAuth, blockClientPlatform, getPortfolioReport);

export default router;
