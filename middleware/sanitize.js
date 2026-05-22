import { FilterXSS } from "xss";

/**
 * Request-body sanitization middleware.
 *
 * One pass over `req.body` and `req.params` that does THREE things:
 *
 *   1. MongoDB-injection prevention
 *      -------------------------------
 *      Mongo treats keys starting with `$` as operators and dotted keys as
 *      nested-field selectors. A login like:
 *
 *        { "email": { "$ne": null }, "password": { "$ne": null } }
 *
 *      would slip past `User.findOne({ email })` and return the FIRST user
 *      in the collection. We strip any key starting with `$` and any key
 *      containing `.`, recursively, so user-supplied data can never reach
 *      Mongo as an operator.
 *
 *      (We don't use `express-mongo-sanitize` because that package mutates
 *      `req.query`, which is a read-only getter in Express 5. This custom
 *      walker works correctly on Express 5.)
 *
 *   2. XSS / unsafe-HTML stripping
 *      --------------------------------
 *      Every string leaf is run through `xss` configured with an empty
 *      whitelist, which strips ALL HTML tags. So an attacker storing
 *      `<script>alert(1)</script>` as their name is reduced to `""`.
 *
 *      (We don't use `xss-clean` because it's unmaintained — last release
 *      2019, no Express 5 fixes — but we use the underlying `xss` library
 *      directly, which IS maintained.)
 *
 *   3. Whitespace trimming
 *      -------------------
 *      Trims leading/trailing whitespace on every string. Stops the classic
 *      "user can't log in because they typed a trailing space in their
 *      email" support ticket.
 *
 * Express 5 note on `req.query`:
 *   Express 5 made `req.query` a read-only getter, so we can't reassign it.
 *   Instead we expose a sanitized copy at `req.sanitizedQuery`. Controllers
 *   that read from `req.query` can opt-in by reading `req.sanitizedQuery`
 *   instead. For our current routes only `?page=` and `?limit=` are used,
 *   which are coerced to numbers anyway, so this isn't a blocker.
 */

// Empty whitelist + strip-on-encounter = remove ALL HTML, but leave plain
// text untouched. So "Bob's Burgers" stays as "Bob's Burgers" (no double
// HTML-escaping like &amp;), while "<script>x</script>" is stripped to "".
const xssFilter = new FilterXSS({
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
});

/**
 * Returns true for any object key that, if passed through to a Mongo query,
 * could be interpreted as a query operator or a nested-path selector.
 */
const isUnsafeKey = (key) =>
  typeof key === "string" && (key.startsWith("$") || key.includes("."));

/**
 * Recursively walk a value and produce a sanitized copy.
 * Strings  -> trimmed and HTML-stripped
 * Arrays   -> elements sanitized
 * Objects  -> unsafe keys dropped, remaining values sanitized
 * Other    -> returned as-is (numbers, booleans, null, Date, etc.)
 */
function sanitizeValue(value) {
  if (typeof value === "string") {
    return xssFilter.process(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (isUnsafeKey(key)) continue; // drop $-prefixed and dotted keys
      out[key] = sanitizeValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Express middleware. Sanitizes req.body and req.params in place; exposes a
 * sanitized read-only copy at req.sanitizedQuery.
 */
export const sanitizeRequest = (req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params);
  }
  if (req.query && typeof req.query === "object") {
    // Don't mutate req.query (Express 5 read-only). Stash a clean copy.
    req.sanitizedQuery = sanitizeValue({ ...req.query });
  }
  next();
};

export default sanitizeRequest;
