import { asyncHandler } from "../../utils/asyncHandler.js";
import * as adminService from "./admin.service.js";

export const stats = asyncHandler(async (_req, res) => {
  const data = await adminService.getPlatformStats();
  res.json(data);
});

export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const data = await adminService.listAllUsers({ skip: (page - 1) * limit, take: limit });
  res.json({ ...data, page, limit });
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await adminService.createUser(req.user.sub, req.body);
  res.status(201).json({ user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await adminService.updateUser(req.user.sub, req.params.userId, req.body);
  res.json({ user });
});

export const listProjects = asyncHandler(async (_req, res) => {
  const projects = await adminService.listAllProjects();
  res.json({ projects });
});

export const auditLog = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const data = await adminService.listAuditLog({ limit, skip: (page - 1) * limit });
  res.json({ ...data, page, limit });
});

export const backup = asyncHandler(async (_req, res) => {
  const data = await adminService.exportCompanyBackup();
  res.json(data);
});
