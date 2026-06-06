import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { randomBytes } from "crypto";
import { HttpError } from "../utils/httpError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_ROOT = path.join(__dirname, "../../uploads/comment-attachments");

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/json",
  "text/plain",
  "application/sql",
  "text/sql",
  "application/octet-stream",
]);

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;

function ensureUploadDir(projectId) {
  const dir = path.join(UPLOAD_ROOT, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      const dir = ensureUploadDir(req.params.projectId);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const safe = String(file.originalname || "file")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    cb(null, `${randomBytes(8).toString("hex")}-${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  const mime = file.mimetype?.toLowerCase() ?? "";
  const ext = path.extname(file.originalname || "").toLowerCase();
  const okMime = ALLOWED_MIME.has(mime) || mime.startsWith("image/");
  const okExt = [".sql", ".json", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext);
  if (okMime || okExt) {
    cb(null, true);
  } else {
    cb(new HttpError(400, `File type not allowed: ${file.originalname}`));
  }
}

export const commentUploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter,
}).array("files", MAX_FILES);

export function relativeStoragePath(projectId, filename) {
  return path.join(projectId, filename).replace(/\\/g, "/");
}

export function absoluteStoragePath(relativePath) {
  const resolved = path.resolve(UPLOAD_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(UPLOAD_ROOT))) {
    throw new HttpError(400, "Invalid attachment path");
  }
  return resolved;
}
