import { asyncHandler } from "../../utils/asyncHandler.js";
import * as tasksService from "./tasks.service.js";

export const listProjectTasks = asyncHandler(async (req, res) => {
  const tasks = await tasksService.listTasksForUser(req.user.sub, {
    projectId: req.params.projectId,
    assigneeId: req.query.assigneeId,
    status: req.query.status,
  });
  res.json({ tasks });
});

export const getTask = asyncHandler(async (req, res) => {
  const task = await tasksService.getTask(req.params.projectId, req.params.taskId);
  res.json({ task });
});

export const createTask = asyncHandler(async (req, res) => {
  const task = await tasksService.createTask(
    req.params.projectId,
    req.user.sub,
    req.body,
  );
  res.status(201).json({ task });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await tasksService.updateTask(
    req.params.projectId,
    req.params.taskId,
    req.user.sub,
    req.body,
  );
  res.json({ task });
});

export const deleteTask = asyncHandler(async (req, res) => {
  await tasksService.deleteTask(
    req.params.projectId,
    req.params.taskId,
    req.user.sub,
  );
  res.status(204).end();
});

export const logProgress = asyncHandler(async (req, res) => {
  const log = await tasksService.logTaskProgress(
    req.params.projectId,
    req.params.taskId,
    req.user.sub,
    req.body,
  );
  res.status(201).json({ log });
});

export const listProgress = asyncHandler(async (req, res) => {
  const logs = await tasksService.listTaskProgress(
    req.params.projectId,
    req.params.taskId,
  );
  res.json({ logs });
});

export const getBoard = asyncHandler(async (req, res) => {
  const board = await tasksService.getKanbanBoard(req.user.sub, {
    projectId: req.query.projectId,
    assigneeId: req.query.assigneeId,
    teamId: req.query.teamId,
    status: req.query.status,
    search: req.query.search,
    priority: req.query.priority,
    dueFrom: req.query.dueFrom,
    dueTo: req.query.dueTo,
    category: req.query.category,
  });
  res.json(board);
});

export const getProgress = asyncHandler(async (req, res) => {
  const members = await tasksService.getMemberProgress(req.user.sub, {
    teamId: req.query.teamId,
    projectId: req.query.projectId,
  });
  res.json({ members });
});

export const getStats = asyncHandler(async (req, res) => {
  const stats = await tasksService.getTaskStats(req.user.sub, {
    projectId: req.query.projectId,
    assigneeId: req.query.assigneeId,
    teamId: req.query.teamId,
    search: req.query.search,
    priority: req.query.priority,
    dueFrom: req.query.dueFrom,
    dueTo: req.query.dueTo,
    category: req.query.category,
  });
  res.json(stats);
});
