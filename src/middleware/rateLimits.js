import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";

const skipInDev = () => !config.isProd;

export const expensiveDbLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimits.expensiveDbMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many database operations — try again in a few minutes" },
  skip: skipInDev,
  keyGenerator: (req) => `${req.user?.sub ?? req.ip}:expensive-db`,
});
