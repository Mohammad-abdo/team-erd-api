import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Verifies Bearer JWT (access) and ensures the user account is still active.
 * Attaches req.user = { sub, email }.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, isActive: true },
  });

  if (!user?.isActive) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = {
    sub: user.id,
    email: user.email,
    impersonatorSub: payload.impersonatorSub ?? null,
  };
  req.actorId = payload.impersonatorSub ?? user.id;
  next();
});
