import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { forgotPasswordLimiter, loginLimiter } from "../../middleware/rateLimits.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.schemas.js";
import * as authController from "./auth.controller.js";

const r = Router();

r.post("/register", validate(registerSchema), authController.register);
r.post("/login", loginLimiter, validate(loginSchema), authController.login);
r.post("/refresh", validate(refreshSchema), authController.refresh);
r.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
r.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);
r.post("/logout", requireAuth, validate(logoutSchema), authController.logout);

r.get("/oauth/providers", authController.oauthProviders);
r.get("/oauth/google", authController.googleOAuthStart);
r.get("/oauth/google/callback", authController.googleOAuthCallback);

export default r;
