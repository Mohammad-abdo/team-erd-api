import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";

import { config } from "./config/index.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { registerSockets } from "./sockets/index.js";
import { attachSocketServer } from "./sockets/emit.js";

import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import projectsRoutes from "./modules/projects/projects.routes.js";
import membersRoutes from "./modules/projects/members.routes.js";
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

const app = express();

// Trust the Apache reverse proxy so req.ip and rate-limit headers are correct.
app.set("trust proxy", 1);

app.use(helmet());

if (!config.isProd) {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);

/** Public health checks — mounted before JSON body parser and rate limit (load balancers / uptime monitors). */
function healthLiveness(_req, res) {
  res.json({ ok: true, service: "dbforge-api" });
}

async function healthReadiness(_req, res) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
}

app.get("/health", healthLiveness);
app.get("/api/health", healthLiveness);
app.get("/ready", healthReadiness);
app.get("/api/ready", healthReadiness);

app.use(express.json({ limit: "1mb" }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, try again later" },
});
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/invitations", invitationsRoutes);
/* Portfolio at /api/report/portfolio — avoid mounting a router on bare /api. */
app.use("/api/report", reportRoutes);

app.use("/api/projects/:projectId/members", membersRoutes);
app.use("/api/projects/:projectId/permissions", permissionsRoutes);
app.use("/api/projects/:projectId/erd", erdRoutes);
app.use("/api/projects/:projectId/api", apiDocsRoutes);
app.use("/api/projects/:projectId/comments", commentsRoutes);
app.use("/api/projects/:projectId/activity", activityRoutes);
app.use("/api/projects/:projectId/export", exportRoutes);
app.use("/api/projects/:projectId/import", importRoutes);

app.use("/api/projects", projectsRoutes);

app.use("/api/notifications", notificationsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ["GET", "POST"] },
});

registerSockets(io);
attachSocketServer(io);

if (process.env.NODE_ENV !== "test") {
  server.listen(config.port, () => {
    console.log(`DBForge API listening on http://localhost:${config.port}`);
  });
}

export { app, server, io };
