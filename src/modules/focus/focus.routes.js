import { z } from "zod";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { validate } from "../../middleware/validate.js";
import * as focusService from "./focus.service.js";

const createSchema = z.object({
  title: z.string().min(1).max(500),
  focusDate: z.string().optional(),
  taskId: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  isDone: z.boolean().optional(),
  syncTask: z.boolean().optional(),
});

const reorderSchema = z.object({
  date: z.string().optional(),
  orderedIds: z.array(z.string().min(1)).min(1),
});

const r = Router();

r.get(
  "/today",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await focusService.listTodayFocus(req.user.sub, { date: req.query.date });
    res.json({ items });
  }),
);

r.get(
  "/team",
  requireAuth,
  asyncHandler(async (req, res) => {
    const summary = await focusService.getTeamFocusSummary(req.user.sub, {
      teamId: req.query.teamId,
      date: req.query.date,
    });
    res.json(summary);
  }),
);

r.post(
  "/",
  requireAuth,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const item = await focusService.createFocusItem(req.user.sub, req.body);
    res.status(201).json({ item });
  }),
);

r.patch(
  "/:itemId",
  requireAuth,
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const item = await focusService.updateFocusItem(req.user.sub, req.params.itemId, req.body);
    res.json({ item });
  }),
);

r.post(
  "/reorder",
  requireAuth,
  validate(reorderSchema),
  asyncHandler(async (req, res) => {
    const items = await focusService.reorderFocusItems(req.user.sub, req.body);
    res.json({ items });
  }),
);

r.delete(
  "/:itemId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const syncTask = req.query.syncTask === "true" || req.query.syncTask === "1";
    await focusService.deleteFocusItem(req.user.sub, req.params.itemId, { syncTask });
    res.status(204).end();
  }),
);

export default r;
