import { asyncHandler } from "../../utils/asyncHandler.js";
import * as membersService from "./members.service.js";

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await membersService.getMemberProfile(req.user.sub, req.params.userId);
  res.json({ profile });
});

export const createRating = asyncHandler(async (req, res) => {
  const rating = await membersService.createMemberRating(
    req.user.sub,
    req.params.userId,
    req.body,
  );
  res.status(201).json({ rating });
});

export const listRatings = asyncHandler(async (req, res) => {
  const ratings = await membersService.listMemberRatings(req.user.sub, req.params.userId);
  res.json({ ratings });
});

export const createReport = asyncHandler(async (req, res) => {
  const report = await membersService.createDailyReport(req.user.sub, req.body);
  res.status(201).json({ report });
});

export const listReports = asyncHandler(async (req, res) => {
  const reports = await membersService.listDailyReports(req.user.sub, {
    userId: req.query.userId,
    teamId: req.query.teamId,
    projectId: req.query.projectId,
    date: req.query.date,
    limit: req.query.limit,
  });
  res.json({ reports });
});

export const assignToProject = asyncHandler(async (req, res) => {
  const member = await membersService.assignMemberToProject(
    req.user.sub,
    req.params.teamId,
    req.params.userId,
    req.body,
  );
  res.status(201).json({ member });
});

export const teamDirectory = asyncHandler(async (req, res) => {
  const members = await membersService.listTeamMemberDirectory(req.user.sub, req.params.teamId);
  res.json({ members });
});
