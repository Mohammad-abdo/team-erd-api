import { asyncHandler } from "../../utils/asyncHandler.js";
import * as dailyTasksService from "./daily-tasks.service.js";

export const listTeamTasks = asyncHandler(async (req, res) => {
  const tasks = await dailyTasksService.listTeamDailyTasks(
    req.user.sub,
    req.params.teamId,
    {
      date: req.query.date,
      assigneeId: req.query.assigneeId,
      status: req.query.status,
      mine: req.query.mine === "true",
    },
  );
  res.json({ tasks });
});

export const getTeamStats = asyncHandler(async (req, res) => {
  const stats = await dailyTasksService.getTeamDailyTaskStats(
    req.user.sub,
    req.params.teamId,
    { date: req.query.date },
  );
  res.json(stats);
});

export const getTeamMembers = asyncHandler(async (req, res) => {
  const members = await dailyTasksService.getTeamMembersForTasks(
    req.user.sub,
    req.params.teamId,
  );
  res.json({ members });
});

export const getOne = asyncHandler(async (req, res) => {
  const task = await dailyTasksService.getDailyTask(
    req.user.sub,
    req.params.teamId,
    req.params.taskId,
  );
  res.json({ task });
});

export const create = asyncHandler(async (req, res) => {
  const task = await dailyTasksService.createDailyTask(
    req.user.sub,
    req.params.teamId,
    req.body,
  );
  res.status(201).json({ task });
});

export const update = asyncHandler(async (req, res) => {
  const task = await dailyTasksService.updateDailyTask(
    req.user.sub,
    req.params.teamId,
    req.params.taskId,
    req.body,
  );
  res.json({ task });
});

export const remove = asyncHandler(async (req, res) => {
  await dailyTasksService.deleteDailyTask(
    req.user.sub,
    req.params.teamId,
    req.params.taskId,
  );
  res.status(204).end();
});

export const listMine = asyncHandler(async (req, res) => {
  const tasks = await dailyTasksService.listMyDailyTasksToday(req.user.sub, {
    date: req.query.date,
  });
  res.json({ tasks });
});

export const getMyStats = asyncHandler(async (req, res) => {
  const stats = await dailyTasksService.getMyDailyTaskStats(req.user.sub, {
    date: req.query.date,
  });
  res.json(stats);
});
