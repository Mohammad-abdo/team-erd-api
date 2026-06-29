import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as shiftsService from "./shifts.service.js";

const r = Router();

r.get(
  "/today",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.getTodayShift(req.user.sub);
    res.json({ shift });
  }),
);

r.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.startShift(req.user.sub);
    res.status(201).json({ shift });
  }),
);

r.post(
  "/end",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shift = await shiftsService.endShift(req.user.sub, req.body ?? {});
    res.json({ shift });
  }),
);

r.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const shifts = await shiftsService.listMyShifts(req.user.sub);
    res.json({ shifts });
  }),
);

r.get(
  "/team",
  requireAuth,
  asyncHandler(async (req, res) => {
    const board = await shiftsService.getTeamShiftBoard(req.user.sub, {
      teamId: req.query.teamId,
      date: req.query.date,
    });
    res.json(board);
  }),
);

r.get(
  "/export",
  requireAuth,
  asyncHandler(async (req, res) => {
    const csv = await shiftsService.exportTeamShiftsCsv(req.user.sub, {
      teamId: req.query.teamId,
      from: req.query.from,
      to: req.query.to,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=shifts-export.csv");
    res.send(csv);
  }),
);

export default r;
