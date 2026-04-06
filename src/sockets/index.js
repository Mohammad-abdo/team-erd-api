import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { prisma } from "../lib/prisma.js";

/**
 * @param {import("socket.io").Server} io
 */
export function registerSockets(io) {
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token;
      const token = typeof raw === "string" ? raw.trim() : "";
      if (!token) {
        return next(new Error("auth_required"));
      }
      const payload = jwt.verify(token, config.jwt.accessSecret);
      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("project:join", async (projectId, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};

      try {
        if (typeof projectId !== "string" || projectId.length === 0) {
          reply({ ok: false, error: "invalid_project" });
          return;
        }

        const member = await prisma.projectMember.findFirst({
          where: { projectId, userId: socket.data.userId },
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        });

        if (!member) {
          reply({ ok: false, error: "forbidden" });
          return;
        }

        await socket.join(`project:${projectId}`);

        const { user } = member;
        socket.to(`project:${projectId}`).emit("presence:peer", {
          userId: user.id,
          name: user.name,
          avatar: user.avatar ?? null,
        });

        reply({ ok: true });
      } catch {
        reply({ ok: false, error: "server_error" });
      }
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
