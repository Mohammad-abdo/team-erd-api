import { Router } from "express";
import { getPortfolioReport } from "./report.controller.js";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

/* Mounted at /api/report — keeps /api free so other /api/* routers dispatch normally. */
router.get("/portfolio", requireAuth, getPortfolioReport);

export default router;
