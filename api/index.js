import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";

import { connectToDatabase } from "../config/db.js";
import routes from "../routes/userRoutes.js";
import swaggerSpec from "../docs/swagger.js";
import { notFound, errorHandler } from "../middleware/errorMiddleware.js";
import { generalLimiter } from "../middleware/rateLimiter.js";
import { sanitizeRequest } from "../middleware/sanitize.js";

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ------------------------------------------------------------------ *
 *  Trust proxy
 * ------------------------------------------------------------------ *
 * Behind Vercel / any reverse proxy the real client IP arrives in the
 * X-Forwarded-For header. Trusting exactly 1 hop tells Express (and
 * express-rate-limit) to use that IP for `req.ip` instead of the proxy's,
 * so rate limits are applied per real user instead of per edge node.
 */
app.set("trust proxy", 1);

/* ------------------------------------------------------------------ *
 *  Security headers (helmet)
 * ------------------------------------------------------------------ *
 * Mounted FIRST so every response — including 404s, errors, and static
 * uploads — gets the security headers.
 *
 * Headers we keep (defaults):
 *   - Strict-Transport-Security ........ force HTTPS for 6 months (no-op on http)
 *   - X-Content-Type-Options: nosniff ... stop MIME sniffing
 *   - X-DNS-Prefetch-Control: off
 *   - X-Download-Options: noopen
 *   - X-Frame-Options: SAMEORIGIN ...... clickjacking protection
 *   - Referrer-Policy: no-referrer
 *   - Origin-Agent-Cluster
 *   - Cross-Origin-Opener-Policy: same-origin
 *   - X-Permitted-Cross-Domain-Policies: none
 *   - X-XSS-Protection: 0
 *   + helmet also REMOVES X-Powered-By so we don't advertise Express
 *
 * Headers we customize:
 *   - contentSecurityPolicy: DISABLED — CSP is meant for HTML pages; this
 *     is a JSON API and the only HTML we ship is Swagger UI, which uses
 *     inline <script> / <style> that the default CSP blocks. Custom-tuning
 *     CSP for Swagger is fragile; for an API the better answer is "off".
 *   - crossOriginResourcePolicy: "cross-origin" — the Next.js frontend
 *     (e.g. http://localhost:3000) needs to <img src="…/uploads/…"> from
 *     this backend (e.g. http://localhost:8000). The default "same-origin"
 *     would silently block those image loads with NS_BINDING_ABORTED.
 *   - crossOriginEmbedderPolicy: false — leave off so the static avatar
 *     URLs don't need CORP-credentialless headers; turn this on only if
 *     you start using SharedArrayBuffer / cross-origin isolation features.
 */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

/* ------------------------------------------------------------------ *
 *  CORS allow-list
 * ------------------------------------------------------------------ *
 * `cors()` with no args lets ANY origin call the API, which is fine for
 * local dev but loses you the entire point of CORS in production.
 *
 *   ALLOWED_ORIGINS=http://localhost:3000,https://my-app.vercel.app
 *
 * If the env var is empty (e.g. local first run) we fall back to allowing
 * everything so the dev experience isn't broken. In production you should
 * always set this explicitly.
 */
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "";
const allowedOrigins = allowedOriginsEnv
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // No Origin header = same-origin request, curl, server-to-server, or
    // mobile app — none of those are CORS-relevant, so let them through.
    if (!origin) return callback(null, true);

    // Empty allow-list = dev convenience: accept everything.
    if (allowedOrigins.length === 0) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Deny silently: don't add the Access-Control-Allow-Origin header so
    // the browser blocks the response. We pass `false` instead of throwing
    // an Error because this is a routine policy decision, not a server
    // fault, and we don't want it logged as a 500 by the error handler.
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// `cors()` registered as global middleware automatically responds to
// preflight OPTIONS requests on any path, so no explicit app.options(...)
// is needed (and Express 5's stricter path-to-regexp rejects "*" anyway).
app.use(cors(corsOptions));

/* ------------------------------------------------------------------ *
 *  Request logging (morgan)
 * ------------------------------------------------------------------ *
 * Morgan logs one line per HTTP request AFTER the response is sent, so
 * the line includes the final status code and the time it took to serve.
 *
 * What we get from this:
 *   - Request logging       method, URL, query string, user-agent, referrer
 *   - Response status       2xx/3xx/4xx/5xx — at-a-glance health of the API
 *   - Latency               response time per request, perfect for spotting
 *                           slow handlers and DB queries
 *   - API monitoring        feed `combined` logs into Datadog / Logflare /
 *                           any log aggregator and you instantly have
 *                           traffic, error-rate, and p95-latency dashboards
 *   - Debugging             "X is broken on prod" -> grep the logs for the
 *                           failing path; you see the exact status code,
 *                           who hit it, and how long it took to fail.
 *
 * Format chosen by NODE_ENV:
 *   - development -> "dev"      compact + ANSI-colored, status/method-aware:
 *                                  GET /api/user/textdata 200 12.345 ms - 67
 *   - production  -> "combined" Apache combined format with timestamp, IP,
 *                                user-agent and referrer — the canonical
 *                                machine-parseable shape every log
 *                                aggregator already understands.
 *   - test        -> skipped    keeps test output clean.
 *
 * Vercel note: morgan writes to process.stdout by default. Vercel captures
 * stdout into the function's runtime logs automatically — no log files,
 * no rotation, no setup. View them under "Logs" in the Vercel dashboard.
 */
if (NODE_ENV !== "test") {
  const format = NODE_ENV === "production" ? "combined" : "dev";

  // In production, skip routine static-asset hits and 304 cache responses
  // so the log isn't drowned in avatar / swagger-css noise. Kept in dev
  // where seeing them is sometimes useful for debugging.
  const skip = (req, res) => {
    if (NODE_ENV !== "production") return false;
    if (req.path.startsWith("/uploads")) return true;
    if (req.path.startsWith("/api-docs")) return true;
    if (res.statusCode === 304) return true;
    return false;
  };

  app.use(morgan(format, { skip }));
}

/* ------------------------------------------------------------------ *
 *  Body parsing
 * ------------------------------------------------------------------ *
 * `limit: "10kb"` blocks request bodies over 10 KB, which is plenty for
 * JSON payloads on this API and protects against memory-exhaustion DoS
 * via gigantic POST bodies. Multer handles its own limits for uploads.
 */
app.use(bodyParser.json({ limit: "10kb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10kb" }));

/* ------------------------------------------------------------------ *
 *  Request body sanitization
 * ------------------------------------------------------------------ *
 * Mounted AFTER bodyParser (so req.body is populated) and BEFORE routes
 * (so handlers see the cleaned data). Order is critical — flipping these
 * two would mean the controllers receive unsanitized input.
 *
 * What this layer does in one pass over req.body / req.params:
 *   - Drops keys like "$ne", "password.$gt" -> blocks Mongo injection
 *   - Strips <script> / <iframe> / on* attributes -> blocks stored XSS
 *   - Trims whitespace -> stops "trailing space in email" bugs
 *
 * What it does NOT do (intentionally):
 *   - Mutate req.query (Express 5's req.query is read-only). Sanitized
 *     query is exposed on req.sanitizedQuery for routes that need it.
 *   - Validate field shapes (email format, password length, etc.). That's
 *     the controller's job — see controller/userController.js for examples
 *     using `validator`.
 */
app.use(sanitizeRequest);

/* ------------------------------------------------------------------ *
 *  Documentation (no DB required, no rate limit)
 * ------------------------------------------------------------------ */
app.get("/", (_req, res) => res.redirect("/api-docs"));
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: "User CRUD API Docs",
  })
);

/* ------------------------------------------------------------------ *
 *  DB connection gate
 * ------------------------------------------------------------------ *
 * Every real API request waits for Mongo to be ready so handlers don't
 * crash on cold start. Failures here surface as a clean 500 instead of
 * an unhandled promise.
 */
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error("DB connection failed:", error);
    return res.status(500).json({
      status: 500,
      success: false,
      message: "Database connection failed",
      data: null,
    });
  }
});

/* ------------------------------------------------------------------ *
 *  Static uploads
 * ------------------------------------------------------------------ *
 * Served before the rate limiter so frontend image fetches don't burn
 * through the API quota every time a profile picture renders.
 */
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

/* ------------------------------------------------------------------ *
 *  Rate limiting (only on /api)
 * ------------------------------------------------------------------ */
app.use("/api", generalLimiter);

/* ------------------------------------------------------------------ *
 *  Application routes
 * ------------------------------------------------------------------ */
app.use("/api/user", routes);

/* ------------------------------------------------------------------ *
 *  404 + error handler
 * ------------------------------------------------------------------ *
 * Order matters: 404 catches anything that didn't match a route,
 * errorHandler catches anything thrown / forwarded via next(err).
 */
app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------------ *
 *  Process-level safety nets
 * ------------------------------------------------------------------ */
process.on("unhandledRejection", (reason) =>
  console.error("unhandledRejection:", reason)
);
process.on("uncaughtException", (err) =>
  console.error("uncaughtException:", err)
);

/* ------------------------------------------------------------------ *
 *  Local dev server
 * ------------------------------------------------------------------ *
 * Vercel never enters this branch — it invokes the exported handler
 * directly instead of running this file as a long-lived server.
 */
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () =>
    console.log(
      `Server running on port ${PORT}\n` +
        `  API:        http://localhost:${PORT}/api/user\n` +
        `  Swagger UI: http://localhost:${PORT}/api-docs\n` +
        `  CORS allow-list: ${
          allowedOrigins.length ? allowedOrigins.join(", ") : "(open / any origin)"
        }`
    )
  );
}

export default app;
