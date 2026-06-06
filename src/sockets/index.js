import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { prisma } from "../lib/prisma.js";
import { resolveProjectMembership } from "../lib/projectMembership.js";

/**
 * @param {import("socket.io").Server} io
 */
export function registerSockets(io) {
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token;
      const token = typeof raw === "string" ? raw.trim() : "";
      if (!token) {
        return next(new Error("auth_required"));
      }
      const payload = jwt.verify(token, config.jwt.accessSecret);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, isActive: true },
      });
      if (!user?.isActive) {
        return next(new Error("unauthorized"));
      }
      socket.data.userId = user.id;
      socket.data.email = user.email;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on("project:join", async (projectId, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};

      try {
        if (typeof projectId !== "string" || projectId.length === 0) {
          reply({ ok: false, error: "invalid_project" });
          return;
        }

        const resolved = await resolveProjectMembership(projectId, socket.data.userId);

        if (!resolved) {
          reply({ ok: false, error: "forbidden" });
          return;
        }

        await socket.join(`project:${projectId}`);

        const { user } = resolved;
        socket.data.userName = user.name;
        socket.data.userAvatar = user.avatar ?? null;

        socket.to(`project:${projectId}`).emit("presence:peer", {
          userId: user.id,
          name: user.name,
          avatar: user.avatar ?? null,
        });

        const socketsInRoom = await io.in(`project:${projectId}`).fetchSockets();
        const peers = socketsInRoom
          .filter((s) => s.data.userId && s.data.userId !== user.id)
          .map((s) => ({
            userId: s.data.userId,
            name: s.data.userName ?? "User",
            avatar: s.data.userAvatar ?? null,
          }));

        reply({ ok: true, peers });
      } catch {
        reply({ ok: false, error: "server_error" });
      }
    });

    socket.on("presence:cursor", (projectId, payload) => {
      if (typeof projectId !== "string" || !payload || typeof payload.x !== "number" || typeof payload.y !== "number") {
        return;
      }
      if (!socket.rooms.has(`project:${projectId}`)) {
        return;
      }
      socket.to(`project:${projectId}`).emit("presence:cursor", {
        userId: socket.data.userId,
        name: socket.data.userName ?? "User",
        avatar: socket.data.userAvatar ?? null,
        x: payload.x,
        y: payload.y,
      });
    });

    socket.on("project:leave", (projectId) => {
      if (typeof projectId !== "string" || projectId.length === 0) {
        return;
      }
      socket.leave(`project:${projectId}`);
      socket.to(`project:${projectId}`).emit("presence:left", {
        userId: socket.data.userId,
      });
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.startsWith("project:")) {
          socket.to(room).emit("presence:left", { userId: socket.data.userId });
        }
      }
    });
  });
}
