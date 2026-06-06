import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken, persistRefreshToken } from "../../lib/tokens.js";
import { enrichUserProfile } from "../../lib/userProfile.js";

export function isGoogleOAuthEnabled() {
  return Boolean(config.oauth.google.clientId && config.oauth.google.clientSecret);
}

export function listOAuthProviders() {
  return { google: isGoogleOAuthEnabled() };
}

export function createOAuthState() {
  return jwt.sign(
    { purpose: "oauth-state", n: randomBytes(8).toString("hex") },
    config.jwt.accessSecret,
    { expiresIn: "10m" },
  );
}

export function verifyOAuthState(state) {
  try {
    const payload = jwt.verify(state, config.jwt.accessSecret);
    if (payload.purpose !== "oauth-state") {
      throw new HttpError(400, "Invalid OAuth state");
    }
    return payload;
  } catch {
    throw new HttpError(400, "Invalid or expired OAuth state");
  }
}

export function googleAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: config.oauth.google.callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGoogleCode(code) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.google.clientId,
      client_secret: config.oauth.google.clientSecret,
      redirect_uri: config.oauth.google.callbackUrl,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    throw new HttpError(401, "Google sign-in failed");
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    throw new HttpError(401, "Google sign-in failed");
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    throw new HttpError(401, "Could not load Google profile");
  }

  return profileRes.json();
}

async function issueSession(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isActive: true },
  });
  if (!user?.isActive) {
    throw new HttpError(403, "Account is disabled");
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refresh = await persistRefreshToken(user.id);
  const profile = await enrichUserProfile(user.id);

  return {
    user: profile,
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

export async function loginWithGoogleCode(code) {
  const profile = await exchangeGoogleCode(code);
  const providerId = String(profile.sub ?? "");
  const email = String(profile.email ?? "").trim().toLowerCase();
  const name = String(profile.name ?? profile.given_name ?? email.split("@")[0] ?? "User").trim();

  if (!providerId || !email) {
    throw new HttpError(400, "Google account is missing required profile fields");
  }

  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider: "google", providerId } },
    include: { user: true },
  });

  if (existingOAuth?.user) {
    return issueSession(existingOAuth.user.id);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    if (!existingUser.isActive) {
      throw new HttpError(403, "Account is disabled");
    }
    await prisma.oAuthAccount.create({
      data: {
        userId: existingUser.id,
        provider: "google",
        providerId,
        email,
      },
    });
    return issueSession(existingUser.id);
  }

  if (!config.allowPublicRegistration && config.isProd) {
    throw new HttpError(403, "No account exists for this email. Contact an administrator.");
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      avatar: profile.picture || null,
      oauthAccounts: {
        create: {
          provider: "google",
          providerId,
          email,
        },
      },
    },
  });

  return issueSession(user.id);
}
