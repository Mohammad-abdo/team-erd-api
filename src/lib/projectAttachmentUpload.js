import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { randomBytes } from "crypto";
import { HttpError } from "../utils/httpError.js";
import { config } from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOAD_ROOT = path.join(__dirname, "../../uploads/project-attachments");
export const UPLOAD_ROOT = config.storage?.projectAttachmentsDir
  ? path.resolve(config.storage.projectAttachmentsDir)
  : DEFAULT_UPLOAD_ROOT;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 10;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/json",
  "text/plain",
  "text/markdown",
  "application/octet-stream",
]);

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
    const ext = path.extname(file.originalname).slice(0, 20);
    cb(null, `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`);
  },
});

export const projectAttachmentUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, `File type not allowed: ${file.mimetype}`));
    }
  },
});
