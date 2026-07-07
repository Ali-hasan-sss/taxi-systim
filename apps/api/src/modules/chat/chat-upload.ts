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

const VOICE_MAX_BYTES = Math.min(
  10 * 1024 * 1024,
  Number(process.env.CHAT_VOICE_MAX_BYTES ?? 8 * 1024 * 1024)
);

const voiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = [".m4a", ".mp4", ".aac", ".mp3", ".webm", ".caf"].includes(ext) ? ext : ".m4a";
    cb(null, `${randomUUID()}${safeExt}`);
  }
});

const VOICE_MIMES = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/x-m4a",
  "audio/webm",
  "audio/caf",
  "audio/x-caf",
  "application/octet-stream"
]);

export const chatVoiceUpload = multer({
  storage: voiceStorage,
  limits: { fileSize: VOICE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    if (!mime.startsWith("audio/") && !VOICE_MIMES.has(mime)) {
      cb(new Error("نوع الملف الصوتي غير مدعوم"));
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
