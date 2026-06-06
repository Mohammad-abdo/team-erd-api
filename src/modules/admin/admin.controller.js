import { config } from "../../config/index.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { isEmailConfigured, sendEmail } from "../../lib/email.js";
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

export const getUser = asyncHandler(async (req, res) => {
  const user = await adminService.getUserDetail(req.params.userId);
  res.json({ user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await adminService.updateUser(req.user.sub, req.params.userId, req.body);
  res.json({ user });
});

export const assignTeam = asyncHandler(async (req, res) => {
  const member = await adminService.assignUserToTeam(req.user.sub, req.params.userId, req.body);
  res.status(201).json({ member });
});

export const removeTeam = asyncHandler(async (req, res) => {
  await adminService.removeUserFromTeam(req.user.sub, req.params.userId, req.params.teamId);
  res.status(204).end();
});

export const assignProject = asyncHandler(async (req, res) => {
  const member = await adminService.assignUserToProject(req.user.sub, req.params.userId, req.body);
  res.status(201).json({ member });
});

export const removeProject = asyncHandler(async (req, res) => {
  await adminService.removeUserFromProject(req.user.sub, req.params.userId, req.params.projectId);
  res.status(204).end();
});

export const listProjects = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const data = await adminService.listAllProjects({ skip: (page - 1) * limit, take: limit });
  res.json({ ...data, page, limit });
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

export const emailStatus = asyncHandler(async (_req, res) => {
  const configured = isEmailConfigured();
  res.json({
    configured,
    mode: configured ? "smtp" : "console",
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    from: config.smtp.from,
    hasAuth: Boolean(config.smtp.user),
  });
});

export const testEmail = asyncHandler(async (req, res) => {
  const result = await sendEmail({
    to: req.body.to,
    subject: "DBForge test email",
    text: "This is a test message from DBForge. If you received this, SMTP is working.",
  });
  res.json({
    ...result,
    to: req.body.to,
    mode: isEmailConfigured() ? "smtp" : "console",
  });
});
