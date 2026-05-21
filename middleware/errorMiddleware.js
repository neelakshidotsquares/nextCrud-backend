import mongoose from "mongoose";
import multer from "multer";

/**
 * Standard error envelope used everywhere in this API:
 *   { status, success: false, message, data: null }
 *
 * In development we also include `stack` for easier debugging; this is
 * stripped in production so we don't leak internals to clients.
 */
const buildEnvelope = (status, message, err) => {
  const body = { status, success: false, message, data: null };
  if (err && process.env.NODE_ENV !== "production") {
    body.stack = err.stack;
  }
  return body;
};

/**
 * 404 catch-all. Registered AFTER all real routes so it only fires for
 * URLs nothing else matched.
 */
export const notFound = (req, res, _next) => {
  return res.status(404).json(
    buildEnvelope(404, `Route not found: ${req.method} ${req.originalUrl}`)
  );
};

/**
 * Global error middleware. Express identifies this by its 4-arg signature.
 *
 * Translates common library-specific errors into clean HTTP responses
 * that match the Swagger schema, then falls through to a generic 500.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  // If a previous middleware already sent the response (e.g. uploadMiddleware
  // formats its own multer errors), let it stand and just log.
  if (res.headersSent) {
    console.error("Error after response sent:", err);
    return;
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);

  // Bad ObjectId in a path param, e.g. /getUserById/abc123 (not 24 hex chars).
  if (err instanceof mongoose.Error.CastError) {
    return res
      .status(400)
      .json(buildEnvelope(400, `Invalid ${err.path}: ${err.value}`, err));
  }

  // Schema validation failure on save() / update().
  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
    return res
      .status(400)
      .json(buildEnvelope(400, `Validation failed: ${fields}`, err));
  }

  // Duplicate key (e.g. registering an email that already exists).
  if (err && err.code === 11000) {
    const key = Object.keys(err.keyValue || {})[0] || "field";
    return res
      .status(409)
      .json(buildEnvelope(409, `Duplicate value for ${key}`, err));
  }

  // JWT failures bubbled up from authMiddleware or jwt.verify elsewhere.
  if (err && (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError")) {
    const msg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return res.status(401).json(buildEnvelope(401, msg, err));
  }

  // Anything multer threw that escaped uploadMiddleware's own handler.
  if (err instanceof multer.MulterError) {
    return res
      .status(400)
      .json(buildEnvelope(400, err.message || "File upload failed", err));
  }

  const status =
    typeof err.statusCode === "number"
      ? err.statusCode
      : typeof err.status === "number"
      ? err.status
      : 500;
  const message = err.message || "Internal server error";

  return res.status(status).json(buildEnvelope(status, message, err));
};
