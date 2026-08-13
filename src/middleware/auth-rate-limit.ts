import { rateLimit } from "express-rate-limit";

const baseOptions = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
  },
};

export const authRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

export const credentialRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

export const verificationRateLimit = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 8,
});
