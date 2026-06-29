import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";

import { config } from "./config/index.js";
import { withApiBasePath } from "./lib/apiPaths.js";
import { initRateLimitStore } from "./lib/rateLimitStore.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { registerSockets } from "./sockets/index.js";
import { attachSocketServer } from "./sockets/emit.js";
import { startWeeklyDigestCron } from "./jobs/weeklyDigestCron.js";
import { startDriftCheckCron } from "./jobs/driftCheckCron.js";
import { startScheduledReportCron } from "./jobs/scheduledReportCron.js";
import { startAccessExpiryCron } from "./jobs/accessExpiryCron.js";

import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import projectAttachmentsRoutes from "./modules/projects/attachments.routes.js";
import projectsRoutes from "./modules/projects/projects.routes.js";
import projectMembersRoutes from "./modules/projects/members.routes.js";
import erdRoutes from "./modules/erd/erd.routes.js";
import apiDocsRoutes from "./modules/apiDocs/apiDocs.routes.js";
import commentsRoutes from "./modules/comments/comments.routes.js";
import activityRoutes from "./modules/activity/activity.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import exportRoutes from "./modules/export/export.routes.js";
import importRoutes from "./modules/import/import.routes.js";
import invitationsRoutes from "./modules/invitations/invitations.routes.js";
import reportRoutes from "./modules/report/report.routes.js";
import permissionsRoutes from "./modules/permissions/permissions.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import teamsRoutes from "./modules/teams/teams.routes.js";
import searchRoutes from "./modules/search/search.routes.js";
import templatesRoutes from "./modules/templates/templates.routes.js";
import publicRoutes from "./modules/public/public.routes.js";
import webhooksRoutes from "./modules/webhooks/webhooks.routes.js";
import aiRoutes from "./modules/ai/ai.routes.js";
import tasksRoutes from "./modules/tasks/tasks.routes.js";
import tasksGlobalRoutes from "./modules/tasks/tasks.global.routes.js";
import dailyTasksGlobalRoutes from "./modules/dailyTasks/daily-tasks.global.routes.js";
import membersRoutes from "./modules/members/members.routes.js";
import organizationsRoutes from "./modules/organizations/organizations.routes.js";
import progressRoutes from "./modules/progress/progress.routes.js";
import { startMeetingReminderCron } from "./jobs/meetingReminderCron.js";
import aiTeamRoutes from "./modules/ai/ai.team.routes.js";
import shiftsRoutes from "./modules/shifts/shifts.routes.js";
import focusRoutes from "./modules/focus/focus.routes.js";
import performanceRoutes from "./modules/performance/performance.routes.js";
import apiStudioRoutes from "./modules/apiStudio/apiStudio.routes.js";
import {
  accessRequestProjectRoutes,
  accessRequestRoutes,
} from "./modules/accessRequests/accessRequests.routes.js";

const app = express();

// Trust the Apache reverse proxy so req.ip and rate-limit headers are correct.
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

if (!config.isProd) {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}
app.use(
  cors({
    origin: config.corsOrigin.length === 1 ? config.corsOrigin[0] : config.corsOrigin,
    credentials: true,
  }),
);

/** Public health checks — mounted before JSON body parser and rate limit (load balancers / uptime monitors). */
function healthLiveness(_req, res) {
  res.json({
    ok: true,
    service: "dbforge-api",
    basePath: config.apiBasePath || null,
    build: "2026-07-roadmap",
    features: [
      "shifts-team",
      "focus-team",
      "performance",
      "org-settings",
      "org-export",
      "org-invitations",
      "api-studio",
      "org-access-requests",
    ],
  });
}

async function healthReadiness(_req, res) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      db: true,
      basePath: config.apiBasePath || null,
    });
  } catch {
    res.status(503).json({ ok: false, db: false, basePath: config.apiBasePath || null });
  }
}

function route(path) {
  return withApiBasePath(config.apiBasePath, path);
}

/** Register a route at the default path and under API_BASE_PATH when configured. */
function mount(path, ...handlers) {
  app.use(path, ...handlers);
  const prefixed = route(path);
  if (prefixed !== path) {
    app.use(prefixed, ...handlers);
  }
}

function registerHealthRoutes() {
  const checks = [
    ["/health", healthLiveness],
    ["/api/health", healthLiveness],
    ["/ready", healthReadiness],
    ["/api/ready", healthReadiness],
  ];
  for (const [path, handler] of checks) {
    app.get(path, handler);
    const prefixed = route(path);
    if (prefixed !== path) {
      app.get(prefixed, handler);
    }
  }
}

registerHealthRoutes();

app.use(express.json({ limit: "1mb" }));

const skipRateLimitInDev = () => !config.isProd;

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.isProd ? 300 : 3000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimitInDev,
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isProd ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, try again later" },
  skip: skipRateLimitInDev,
});
mount("/api/auth", authLimiter, authRoutes);
mount("/api/organizations", organizationsRoutes);
mount("/api/admin", adminRoutes);
mount("/api/teams", teamsRoutes);
mount("/api/search", searchRoutes);
mount("/api/templates", templatesRoutes);
mount("/api/public", publicRoutes);
mount("/api/users", usersRoutes);
mount("/api/invitations", invitationsRoutes);
/* Portfolio at /api/report/portfolio — avoid mounting a router on bare /api. */
mount("/api/report", reportRoutes);

mount("/api/projects/:projectId/attachments", projectAttachmentsRoutes);
mount("/api/projects/:projectId/members", projectMembersRoutes);
mount("/api/projects/:projectId/access-requests", accessRequestProjectRoutes);
mount("/api/projects/:projectId/permissions", permissionsRoutes);
mount("/api/projects/:projectId/erd", erdRoutes);
mount("/api/projects/:projectId/api", apiDocsRoutes);
mount("/api/projects/:projectId/api-studio", apiStudioRoutes);
mount("/api/projects/:projectId/comments", commentsRoutes);
mount("/api/projects/:projectId/activity", activityRoutes);
mount("/api/projects/:projectId/export", exportRoutes);
mount("/api/projects/:projectId/import", importRoutes);
mount("/api/projects/:projectId/ai", aiRoutes);
mount("/api/projects/:projectId/webhooks", webhooksRoutes);
mount("/api/projects/:projectId/tasks", tasksRoutes);

mount("/api/projects", projectsRoutes);

mount("/api/access-requests", accessRequestRoutes);
mount("/api/notifications", notificationsRoutes);
mount("/api/tasks", tasksGlobalRoutes);
mount("/api/daily-tasks", dailyTasksGlobalRoutes);
mount("/api/members", membersRoutes);
mount("/api/progress", progressRoutes);
mount("/api/performance", performanceRoutes);
mount("/api/shifts", shiftsRoutes);
mount("/api/focus", focusRoutes);
mount("/api/ai/team", aiTeamRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const socketPath = config.apiBasePath ? `${config.apiBasePath}/socket.io` : "/socket.io";

const io = new Server(server, {
  path: socketPath,
  cors: {
    origin: config.corsOrigin.length === 1 ? config.corsOrigin[0] : config.corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
});

registerSockets(io);
attachSocketServer(io);

if (process.env.NODE_ENV !== "test") {
  initRateLimitStore().then(() => {
    server.listen(config.port, () => {
      const base = config.apiBasePath ? ` (base path ${config.apiBasePath})` : "";
      console.log(`DBForge API listening on http://localhost:${config.port}${base}`);
      console.log(`CORS origins: ${config.corsOrigin.join(", ")}`);
      startWeeklyDigestCron();
      startDriftCheckCron();
      startScheduledReportCron();
      startAccessExpiryCron();
      startMeetingReminderCron();
    });
  });
}

export { app, server, io };
