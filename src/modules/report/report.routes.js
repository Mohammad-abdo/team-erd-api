import { Router } from "express";
import { getPortfolioReport, getPortfolioDrift } from "./report.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { blockClientPlatform } from "../../middleware/clientPortal.js";

const router = Router();

/* Mounted at /api/report — keeps /api free so other /api/* routers dispatch normally. */
router.get("/portfolio", requireAuth, blockClientPlatform, getPortfolioReport);
router.get("/drift-portfolio", requireAuth, blockClientPlatform, getPortfolioDrift);

export default router;
