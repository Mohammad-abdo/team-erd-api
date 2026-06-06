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
import {
  createOAuthState,
  getAuthorizeUrl,
  isOAuthProviderEnabled,
  listOAuthProviders,
  loginWithOAuthCode,
  verifyOAuthState,
} from "./oauth.service.js";

export const register = asyncHandler(async (req, res) => {
  if (!config.allowPublicRegistration) {
    throw new HttpError(403, "Public registration is disabled. Contact an administrator.");
  }
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

export const oauthProviders = asyncHandler(async (_req, res) => {
  res.json(listOAuthProviders());
});

export const oauthStart = asyncHandler(async (req, res) => {
  const provider = String(req.params.provider ?? "");
  if (!isOAuthProviderEnabled(provider)) {
    throw new HttpError(503, `${provider} sign-in is not configured`);
  }
  const state = createOAuthState(provider);
  res.redirect(getAuthorizeUrl(provider, state));
});

export const oauthCallback = asyncHandler(async (req, res) => {
  const provider = String(req.params.provider ?? "");
  if (!isOAuthProviderEnabled(provider)) {
    throw new HttpError(503, `${provider} sign-in is not configured`);
  }

  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`${config.appUrl}/auth/login?oauth_error=${encodeURIComponent(String(error))}`);
  }
  if (!code || !state) {
    throw new HttpError(400, "Missing OAuth code or state");
  }

  verifyOAuthState(String(state), provider);
  const session = await loginWithOAuthCode(provider, String(code));

  const params = new URLSearchParams({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  res.redirect(`${config.appUrl}/auth/oauth/callback?${params.toString()}`);
});
