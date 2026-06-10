import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { randomBytes } from "crypto";
import { HttpError } from "../utils/httpError.js";
import { config } from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AVATAR_ROOT = path.join(__dirname, "../../uploads/avatars");

export const AVATAR_UPLOAD_ROOT = config.storage.avatarsDir
  ? path.resolve(config.storage.avatarsDir)
  : DEFAULT_AVATAR_ROOT;

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function ensureUserDir(userId) {
  const dir = path.join(AVATAR_UPLOAD_ROOT, userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      const dir = ensureUserDir(req.user.sub);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = ALLOWED_EXT.has(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${randomBytes(6).toString("hex")}${safeExt}`);
  },
});

function fileFilter(_req, file, cb) {
  const mime = file.mimetype?.toLowerCase() ?? "";
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) {
    cb(null, true);
  } else {
    cb(new HttpError(400, "Avatar must be a JPEG, PNG, GIF, or WebP image"));
  }
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter,
});

export const avatarUploadMiddleware = upload.single("avatar");

export function avatarUploadHandler(req, res, next) {
  avatarUploadMiddleware(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new HttpError(413, "Avatar must be 2 MB or smaller"));
      }
      return next(new HttpError(400, err.message));
    }
    return next(err);
  });
}

export function avatarStoragePath(userId, filename) {
  const safeName = path.basename(filename);
  const resolved = path.resolve(AVATAR_UPLOAD_ROOT, userId, safeName);
  const userRoot = path.resolve(AVATAR_UPLOAD_ROOT, userId);
  if (!resolved.startsWith(userRoot)) {
    throw new HttpError(400, "Invalid avatar path");
  }
  return resolved;
}

export function buildAvatarPublicUrl(req, userId, filename) {
  const safeName = encodeURIComponent(path.basename(filename));
  const rel = `${config.apiBasePath || ""}/api/users/avatars/${userId}/${safeName}`;

  if (config.apiPublicUrl) {
    const apiRoot = config.apiPublicUrl.replace(/\/api\/?$/i, "");
    return `${apiRoot}${rel}`;
  }

  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || (config.isProd ? "https" : req.protocol) || "http";
  return `${proto}://${host}${rel}`;
}

/** Upgrade http→https in prod and align managed avatar URLs with API_PUBLIC_URL. */
export function normalizeAvatarUrl(avatar) {
  if (!avatar || typeof avatar !== "string") return avatar ?? null;
  let url = avatar.trim();
  if (!url) return null;

  if (/^http:\/\//i.test(url) && url.includes("/users/avatars/")) {
    url = url.replace(/^http:\/\//i, "https://");
  }

  if (config.apiPublicUrl && url.includes("/users/avatars/")) {
    try {
      const parsed = new URL(url);
      const apiRoot = config.apiPublicUrl.replace(/\/api\/?$/i, "");
      return `${apiRoot}${parsed.pathname}`;
    } catch {
      /* keep best-effort url */
    }
  }

  return url;
}

export function isManagedAvatarUrl(avatarUrl, userId) {
  if (!avatarUrl || !userId) return false;
  try {
    const u = new URL(avatarUrl, "http://localhost");
    return u.pathname.includes(`/users/avatars/${userId}/`);
  } catch {
    return avatarUrl.includes(`/users/avatars/${userId}/`);
  }
}

export function deleteManagedAvatarFile(avatarUrl, userId) {
  if (!isManagedAvatarUrl(avatarUrl, userId)) return;
  try {
    const u = new URL(avatarUrl, "http://localhost");
    const parts = u.pathname.split("/");
    const filename = decodeURIComponent(parts[parts.length - 1] || "");
    if (!filename) return;
    const abs = avatarStoragePath(userId, filename);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore cleanup errors */
  }
}
