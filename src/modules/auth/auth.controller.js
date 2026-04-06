import { asyncHandler } from "../../utils/asyncHandler.js";
import { config } from "../../config/index.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./auth.service.js";
import { rotateRefreshToken, signAccessToken } from "../../lib/tokens.js";
import { HttpError } from "../../utils/httpError.js";

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);
  res.json(result);
});

export const refresh = asyncHandler(async (req, res) => {
  const rotated = await rotateRefreshToken(req.body.refreshToken);
  if (!rotated) {
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  const accessToken = signAccessToken({
    sub: rotated.user.id,
    email: rotated.user.email,
  });

  res.json({
    accessToken,
    refreshToken: rotated.refreshToken,
    refreshExpiresAt: rotated.refreshExpiresAt,
  });
});

export const logout = asyncHandler(async (req, res) => {
  await logoutUser(req.user.sub, req.body.refreshToken);
  res.status(204).end();
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await requestPasswordReset(req.body.email);
  const payload = {
    message: "If an account exists for this email, password reset instructions have been generated.",
  };
  if (config.nodeEnv === "development" && result.devToken) {
    payload.devResetToken = result.devToken;
  }
  res.json(payload);
});

export const resetPassword = asyncHandler(async (req, res) => {
  await resetPasswordWithToken(req.body.token, req.body.password);
  res.json({ message: "Password has been reset. You can sign in with your new password." });
});
