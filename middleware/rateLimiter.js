import rateLimit from "express-rate-limit";

/**
 * Rate limiters for the API.
 *
 * Why two of them?
 *   - The GENERAL limiter is a coarse safety net that protects every API
 *     route from accidental floods, runaway clients, and low-effort abuse.
 *   - The LOGIN limiter is much stricter because login is the highest-value
 *     attack surface: it's the only un-authenticated endpoint where guessing
 *     a credential could compromise an account.
 *
 * Serverless / Vercel note:
 *   express-rate-limit's default store is in-memory and is therefore PER
 *   SERVERLESS INSTANCE. Counters reset whenever Vercel cold-starts a new
 *   container, and concurrent instances each keep their own count. This is
 *   acceptable for a defense-in-depth limiter, but if you need a strict,
 *   globally consistent limit in production, swap MemoryStore for
 *   `rate-limit-redis` (or another shared store like Memcached).
 */

/**
 * Build a JSON 429 response that matches the rest of the API's envelope
 * shape: { status, success, message, data }.
 *
 * `retry-after` (in seconds) is the value of `X-RateLimit-Reset` the limiter
 * already sets in the response headers; we also surface it in the JSON body
 * so clients reading only the body know when they can retry.
 */
const buildHandler =
  (message) =>
  (req, res, _next, options) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    return res.status(options.statusCode).json({
      status: options.statusCode,
      success: false,
      message,
      data: null,
      retryAfter: retryAfterSeconds,
    });
  };

/**
 * General API limiter.
 *   - 100 requests
 *   - per 15 minutes
 *   - per IP address
 *
 * Mount this once at the app level so every /api/* route inherits it.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: "draft-7", // adds RateLimit-* headers (RFC draft 7)
  legacyHeaders: false, // drops the old X-RateLimit-* headers
  message: "Too many requests. Please slow down and try again later.",
  handler: buildHandler(
    "Too many requests. Please slow down and try again later."
  ),
});

/**
 * Strict login limiter.
 *   - 5 attempts
 *   - per 10 minutes
 *   - per IP address
 *
 * `skipSuccessfulRequests: true` means a SUCCESSFUL login doesn't burn
 * through the quota — only failed attempts count. This way a legitimate
 * user who logs in once isn't punished, but a brute-forcer who keeps
 * guessing gets locked out fast.
 *
 * Apply this directly on the login route, BEFORE the controller.
 */
export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: "Too many login attempts. Please try again in a few minutes.",
  handler: buildHandler(
    "Too many login attempts. Please try again in a few minutes."
  ),
});
