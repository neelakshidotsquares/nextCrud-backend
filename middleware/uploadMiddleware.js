import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All uploaded files live here on disk. Created on startup if missing.
// On Vercel only /tmp is writable, so we point there when running in that env.
// Note: /tmp is ephemeral — uploads won't persist between invocations. For
// real persistence in production, swap this for object storage (S3, Vercel Blob, etc.).
export const UPLOAD_DIR = process.env.VERCEL
  ? path.join("/tmp", "uploads")
  : path.resolve(__dirname, "..", "uploads");
export const UPLOAD_PUBLIC_PATH = "/uploads";

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (err) {
  // Read-only FS on the platform — uploads will fail at request time, but
  // don't take the whole function down at cold start because of it.
  console.warn("Could not prepare upload directory:", err.message);
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    const userId = req.params.id || (req.user && req.user.userId) || "anon";
    cb(null, `${userId}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    // Plain Error so we can tell it apart from multer's own LIMIT_UNEXPECTED_FILE,
    // which means "wrong field name" — a very different bug.
    const err = new Error("Only JPG, PNG, GIF, or WEBP images are allowed.");
    err.code = "INVALID_FILE_TYPE";
    return cb(err);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Wrap multer's `upload.single(field)` so any upload error (wrong type,
 * file too large, etc.) becomes a JSON response in the same shape the
 * rest of the API uses: { status, success, message, data: null }.
 *
 * Usage: routes.post("/uploadAvatar/:id", authMiddleware, uploadSingle("image"), uploadImage);
 */
export const uploadSingle = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      let message = "File upload failed";
      if (err.code === "LIMIT_FILE_SIZE") {
        message = `File too large. Max ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB.`;
      } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
        message = `Unexpected file field "${err.field}". Expected field "${fieldName}".`;
      }
      return res
        .status(400)
        .json({ status: 400, success: false, message, data: null });
    }

    if (err.code === "INVALID_FILE_TYPE") {
      return res.status(400).json({
        status: 400,
        success: false,
        message: err.message,
        data: null,
      });
    }

    return res.status(500).json({
      status: 500,
      success: false,
      message: err.message || "Upload failed",
      data: null,
    });
  });
};
