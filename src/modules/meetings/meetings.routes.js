import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import * as meetingsService from "./meetings.service.js";

const r = Router({ mergeParams: true });

r.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const meetings = await meetingsService.listMeetingsForTeam(
      req.user.sub,
      req.params.teamId,
    );
    res.json({ meetings });
  }),
);

r.post(
  "/",
  requireAuth,
  validate(meetingsService.createMeetingSchema),
  asyncHandler(async (req, res) => {
    const meeting = await meetingsService.createMeeting(
      req.user.sub,
      req.params.teamId,
      req.body,
    );
    res.status(201).json({ meeting });
  }),
);

r.delete(
  "/:meetingId",
  requireAuth,
  asyncHandler(async (req, res) => {
    await meetingsService.deleteMeeting(
      req.user.sub,
      req.params.teamId,
      req.params.meetingId,
    );
    res.status(204).end();
  }),
);

export default r;
