import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";

const UPLOAD_ROOT = path.resolve(process.env.CHAT_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "chat"));
const MAX_BYTES = Math.min(10 * 1024 * 1024, Number(process.env.CHAT_IMAGE_MAX_BYTES ?? 5 * 1024 * 1024));

if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
    cb(null, `${randomUUID()}${safeExt}`);
  }
});

export const chatImageUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("نوع الملف غير مدعوم"));
      return;
    }
    cb(null, true);
  }
});

export function getChatUploadRoot() {
  return UPLOAD_ROOT;
}

export function resolveChatImagePath(filename: string) {
  const base = path.basename(filename);
  return path.join(UPLOAD_ROOT, base);
}
