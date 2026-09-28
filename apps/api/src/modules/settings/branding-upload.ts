import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";

const UPLOAD_ROOT = path.resolve(process.env.BRANDING_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "branding"));
const MAX_BYTES = 6 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype.toLowerCase()] ?? ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  }
});

export const brandingImageUpload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT_BY_MIME[file.mimetype.toLowerCase()]) {
      cb(new Error("نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP"));
      return;
    }
    cb(null, true);
  }
});

export function getBrandingUploadRoot() {
  return UPLOAD_ROOT;
}

export function safeBrandingPath(filename: string): string | null {
  const base = path.basename(filename);
  if (!base || base !== filename) return null;
  const root = path.resolve(UPLOAD_ROOT);
  const full = path.resolve(root, base);
  const relative = path.relative(root, full);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return full;
}

export function deleteBrandingFile(filename: string) {
  const full = safeBrandingPath(filename);
  if (!full || !fs.existsSync(full)) return;
  fs.unlinkSync(full);
}
