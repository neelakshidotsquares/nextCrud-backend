/**
 * Wraps an async Express handler so any thrown error / rejected promise
 * gets forwarded to the global error middleware via next(err), instead of
 * crashing the process or hanging the request.
 *
 * Usage:
 *   routes.get("/users", asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
