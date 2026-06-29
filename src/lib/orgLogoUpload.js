import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { randomBytes } from "crypto";
import { HttpError } from "../utils/httpError.js";
import { config } from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOGO_ROOT = path.join(__dirname, "../../uploads/org-logos");

export const ORG_LOGO_UPLOAD_ROOT = config.storage.orgLogosDir
  ? path.resolve(config.storage.orgLogosDir)
  : DEFAULT_LOGO_ROOT;

export const MAX_ORG_LOGO_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);

function ensureOrgDir(orgId) {
  const dir = path.join(ORG_LOGO_UPLOAD_ROOT, orgId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      const orgId = req.orgLogoOrgId;
      if (!orgId) return cb(new HttpError(400, "Organization context required"));
      const dir = ensureOrgDir(orgId);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeExt = ALLOWED_EXT.has(ext) ? ext : ".png";
    cb(null, `logo-${Date.now()}-${randomBytes(6).toString("hex")}${safeExt}`);
  },
});

function fileFilter(_req, file, cb) {
  const mime = file.mimetype?.toLowerCase() ?? "";
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ALLOWED_MIME.has(mime) || ALLOWED_EXT.has(ext)) {
    cb(null, true);
  } else {
    cb(new HttpError(400, "Logo must be JPEG, PNG, GIF, WebP, or SVG"));
  }
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_ORG_LOGO_BYTES, files: 1 },
  fileFilter,
});

export const orgLogoUploadMiddleware = upload.single("logo");

export function orgLogoUploadHandler(req, res, next) {
  orgLogoUploadMiddleware(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new HttpError(413, "Logo must be 2 MB or smaller"));
      }
      return next(new HttpError(400, err.message));
    }
    return next(err);
  });
}

export function orgLogoStoragePath(orgId, filename) {
  const safeName = path.basename(filename);
  const resolved = path.resolve(ORG_LOGO_UPLOAD_ROOT, orgId, safeName);
  const orgRoot = path.resolve(ORG_LOGO_UPLOAD_ROOT, orgId);
  if (!resolved.startsWith(orgRoot)) {
    throw new HttpError(400, "Invalid logo path");
  }
  return resolved;
}

export function buildOrgLogoPublicUrl(req, orgId, filename) {
  const safeName = encodeURIComponent(path.basename(filename));
  const rel = `${config.apiBasePath || ""}/api/organizations/logos/${orgId}/${safeName}`;

  if (config.apiPublicUrl) {
    const apiRoot = config.apiPublicUrl.replace(/\/api\/?$/i, "");
    return `${apiRoot}${rel}`;
  }

  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || (config.isProd ? "https" : req.protocol) || "http";
  return `${proto}://${host}${rel}`;
}

export function normalizeOrgLogoUrl(logoUrl) {
  if (!logoUrl || typeof logoUrl !== "string") return logoUrl ?? null;
  let url = logoUrl.trim();
  if (!url) return null;

  if (/^http:\/\//i.test(url) && url.includes("/organizations/logos/")) {
    url = url.replace(/^http:\/\//i, "https://");
  }

  if (config.apiPublicUrl && url.includes("/organizations/logos/")) {
    try {
      const parsed = new URL(url);
      const apiRoot = config.apiPublicUrl.replace(/\/api\/?$/i, "");
      return `${apiRoot}${parsed.pathname}`;
    } catch {
      /* keep url */
    }
  }

  return url;
}

export function isManagedOrgLogoUrl(logoUrl, orgId) {
  if (!logoUrl || !orgId) return false;
  try {
    const u = new URL(logoUrl, "http://localhost");
    return u.pathname.includes(`/organizations/logos/${orgId}/`);
  } catch {
    return logoUrl.includes(`/organizations/logos/${orgId}/`);
  }
}

export function deleteManagedOrgLogoFile(logoUrl, orgId) {
  if (!isManagedOrgLogoUrl(logoUrl, orgId)) return;
  try {
    const u = new URL(logoUrl, "http://localhost");
    const parts = u.pathname.split("/");
    const filename = decodeURIComponent(parts[parts.length - 1] || "");
    if (!filename) return;
    const abs = orgLogoStoragePath(orgId, filename);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

export function getOrgLogoFile(orgId, filename) {
  const abs = orgLogoStoragePath(orgId, filename);
  if (!fs.existsSync(abs)) {
    throw new HttpError(404, "Logo not found");
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  }[ext] ?? "application/octet-stream";
  return { abs, mime };
}
