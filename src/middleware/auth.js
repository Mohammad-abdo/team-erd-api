import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

/**
 * Verifies Bearer JWT (access). Attaches req.user = { sub, email }.
 * Replace with full user lookup when auth module is implemented.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, config.jwt.accessSecret);
    req.user = { sub: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
