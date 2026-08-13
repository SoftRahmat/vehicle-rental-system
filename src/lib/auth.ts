import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import config from "../config";
import { prisma } from "./prisma";

const googleConfigured = Boolean(
  config.googleClientId && config.googleClientSecret,
);

export const auth = betterAuth({
  appName: "Roadly",
  baseURL: config.backendUrl,
  basePath: "/api/v1/auth/session",
  secret: config.betterAuthSecret,
  trustedOrigins: [config.frontendUrl ?? "http://localhost:4200"],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  user: {
    modelName: "User",
    fields: { image: "avatarUrl" },
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false,
      },
      // Google accounts complete this after OAuth. Booking creation remains
      // protected by requireVerifiedPhone.
      phone: { type: "string", required: false },
      phoneVerifiedAt: { type: "date", required: false, input: false },
    },
  },
  session: {
    modelName: "AuthSession",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  account: {
    modelName: "AuthAccount",
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  verification: { modelName: "AuthVerification" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    password: {
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ password, hash }) => bcrypt.compare(password, hash),
    },
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: config.googleClientId as string,
          clientSecret: config.googleClientSecret as string,
        },
      }
    : {},
  advanced: {
    cookiePrefix: "roadly",
    useSecureCookies: config.nodeEnv === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: config.nodeEnv === "production" ? "none" : "lax",
    },
    database: {
      generateId: "serial",
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
});
