import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken, persistRefreshToken } from "../../lib/tokens.js";
import { enrichUserProfile } from "../../lib/userProfile.js";

const SUPPORTED_PROVIDERS = ["google", "github", "microsoft"];

export function isOAuthProviderEnabled(provider) {
  switch (provider) {
    case "google":
      return Boolean(config.oauth.google.clientId && config.oauth.google.clientSecret);
    case "github":
      return Boolean(config.oauth.github.clientId && config.oauth.github.clientSecret);
    case "microsoft":
      return Boolean(config.oauth.microsoft.clientId && config.oauth.microsoft.clientSecret);
    default:
      return false;
  }
}

export function isGoogleOAuthEnabled() {
  return isOAuthProviderEnabled("google");
}

export function listOAuthProviders() {
  return Object.fromEntries(
    SUPPORTED_PROVIDERS.map((provider) => [provider, isOAuthProviderEnabled(provider)]),
  );
}

export function createOAuthState(provider) {
  return jwt.sign(
    { purpose: "oauth-state", provider, n: randomBytes(8).toString("hex") },
    config.jwt.accessSecret,
    { expiresIn: "10m" },
  );
}

export function verifyOAuthState(state, provider) {
  try {
    const payload = jwt.verify(state, config.jwt.accessSecret);
    if (payload.purpose !== "oauth-state" || payload.provider !== provider) {
      throw new HttpError(400, "Invalid OAuth state");
    }
    return payload;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Invalid or expired OAuth state");
  }
}

export function getAuthorizeUrl(provider, state) {
  switch (provider) {
    case "google":
      return googleAuthorizeUrl(state);
    case "github":
      return githubAuthorizeUrl(state);
    case "microsoft":
      return microsoftAuthorizeUrl(state);
    default:
      throw new HttpError(400, "Unsupported OAuth provider");
  }
}

function googleAuthorizeUrl(state) {
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

function githubAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    redirect_uri: config.oauth.github.callbackUrl,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

function microsoftAuthorizeUrl(state) {
  const tenant = config.oauth.microsoft.tenant;
  const params = new URLSearchParams({
    client_id: config.oauth.microsoft.clientId,
    redirect_uri: config.oauth.microsoft.callbackUrl,
    response_type: "code",
    scope: "openid email profile User.Read",
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
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
  if (!tokenRes.ok) throw new HttpError(401, "Google sign-in failed");
  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new HttpError(401, "Google sign-in failed");

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new HttpError(401, "Could not load Google profile");
  const profile = await profileRes.json();
  return {
    providerId: String(profile.sub ?? ""),
    email: String(profile.email ?? "").trim().toLowerCase(),
    name: String(profile.name ?? profile.given_name ?? "User").trim(),
    avatar: profile.picture || null,
  };
}

async function exchangeGithubCode(code) {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.github.clientId,
      client_secret: config.oauth.github.clientSecret,
      redirect_uri: config.oauth.github.callbackUrl,
    }),
  });
  if (!tokenRes.ok) throw new HttpError(401, "GitHub sign-in failed");
  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new HttpError(401, "GitHub sign-in failed");

  const profileRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "DBForge",
    },
  });
  if (!profileRes.ok) throw new HttpError(401, "Could not load GitHub profile");
  const profile = await profileRes.json();

  let email = String(profile.email ?? "").trim().toLowerCase();
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "DBForge",
      },
    });
    if (emailsRes.ok) {
      const emails = await emailsRes.json();
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      email = String(primary?.email ?? "").trim().toLowerCase();
    }
  }

  return {
    providerId: String(profile.id ?? ""),
    email,
    name: String(profile.name ?? profile.login ?? "User").trim(),
    avatar: profile.avatar_url || null,
  };
}

async function exchangeMicrosoftCode(code) {
  const tenant = config.oauth.microsoft.tenant;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.microsoft.clientId,
      client_secret: config.oauth.microsoft.clientSecret,
      redirect_uri: config.oauth.microsoft.callbackUrl,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new HttpError(401, "Microsoft sign-in failed");
  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new HttpError(401, "Microsoft sign-in failed");

  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new HttpError(401, "Could not load Microsoft profile");
  const profile = await profileRes.json();

  const email = String(profile.mail ?? profile.userPrincipalName ?? "").trim().toLowerCase();
  return {
    providerId: String(profile.id ?? ""),
    email,
    name: String(profile.displayName ?? email.split("@")[0] ?? "User").trim(),
    avatar: null,
  };
}

async function exchangeProviderCode(provider, code) {
  switch (provider) {
    case "google":
      return exchangeGoogleCode(code);
    case "github":
      return exchangeGithubCode(code);
    case "microsoft":
      return exchangeMicrosoftCode(code);
    default:
      throw new HttpError(400, "Unsupported OAuth provider");
  }
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

async function linkOrCreateOAuthUser(provider, profile) {
  const providerId = String(profile.providerId ?? "");
  const email = String(profile.email ?? "").trim().toLowerCase();
  const name = String(profile.name ?? email.split("@")[0] ?? "User").trim();

  if (!providerId || !email) {
    throw new HttpError(400, "OAuth account is missing required profile fields");
  }

  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider, providerId } },
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
      data: { userId: existingUser.id, provider, providerId, email },
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
      avatar: profile.avatar || null,
      oauthAccounts: {
        create: { provider, providerId, email },
      },
    },
  });

  return issueSession(user.id);
}

export async function loginWithOAuthCode(provider, code) {
  if (!isOAuthProviderEnabled(provider)) {
    throw new HttpError(503, `${provider} sign-in is not configured`);
  }
  const profile = await exchangeProviderCode(provider, code);
  return linkOrCreateOAuthUser(provider, profile);
}

/** @deprecated use loginWithOAuthCode("google", code) */
export async function loginWithGoogleCode(code) {
  return loginWithOAuthCode("google", code);
}

/** @deprecated use getAuthorizeUrl("google", state) */
export function googleAuthorizeUrlLegacy(state) {
  return googleAuthorizeUrl(state);
}
