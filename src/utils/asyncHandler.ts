import { RequestHandler } from "express";
/**
 * Wraps async route handlers and forwards errors
 * to Express error middleware.
*/
export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
