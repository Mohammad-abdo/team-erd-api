import { asyncHandler } from "../../utils/asyncHandler.js";
import * as teamsService from "./teams.service.js";
import * as teamDigestService from "./teamDigest.service.js";

export const list = asyncHandler(async (req, res) => {
  const payload = await teamsService.listTeamsForUser(req.user.sub);
  res.json(payload);
});

export const getOne = asyncHandler(async (req, res) => {
  const team = await teamsService.getTeamForUser(req.user.sub, req.params.teamId);
  res.json({ team });
});

export const create = asyncHandler(async (req, res) => {
  const team = await teamsService.createTeam(req.user.sub, req.body);
  res.status(201).json({ team });
});

export const update = asyncHandler(async (req, res) => {
  const team = await teamsService.updateTeam(req.user.sub, req.params.teamId, req.body);
  res.json({ team });
});

export const remove = asyncHandler(async (req, res) => {
  await teamsService.deleteTeam(req.user.sub, req.params.teamId);
  res.status(204).end();
});

export const addMember = asyncHandler(async (req, res) => {
  const member = await teamsService.addTeamMember(req.user.sub, req.params.teamId, req.body);
  res.status(201).json({ member });
});

export const updateMemberRole = asyncHandler(async (req, res) => {
  const member = await teamsService.addTeamMember(req.user.sub, req.params.teamId, {
    userId: req.params.userId,
    role: req.body.role,
  });
  res.json({ member });
});

export const removeMember = asyncHandler(async (req, res) => {
  await teamsService.removeTeamMember(req.user.sub, req.params.teamId, req.params.userId);
  res.status(204).end();
});

export const assignProject = asyncHandler(async (req, res) => {
  const link = await teamsService.assignProjectToTeam(req.user.sub, req.params.teamId, req.body.projectId);
  res.status(201).json({ link });
});

export const unassignProject = asyncHandler(async (req, res) => {
  await teamsService.unassignProjectFromTeam(req.user.sub, req.params.teamId, req.params.projectId);
  res.status(204).end();
});

export const sendWeeklyDigest = asyncHandler(async (req, res) => {
  const result = await teamDigestService.sendTeamWeeklyDigest(req.user.sub, req.params.teamId);
  res.json(result);
});
