import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer } from "better-auth/plugins";
import config from "../config";
import { prisma } from "./prisma";

const googleClientIds = [
  config.googleClientId,
  config.googleAndroidClientId,
  config.googleIosClientId,
].filter((clientId): clientId is string => Boolean(clientId));
const googleConfigured = Boolean(
  googleClientIds.length > 0 && config.googleClientSecret,
);

export const auth = betterAuth({
  appName: "Roadly",
  baseURL: config.backendUrl,
  basePath: "/api/v1/auth/session",
  secret: config.betterAuthSecret,
  trustedOrigins: [
    config.frontendUrl ?? "http://localhost:4200",
    ...config.mobileTrustedOrigins,
  ],
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
          // Keep the Web client first: it owns the browser callback while all
          // configured platform audiences remain valid for native ID tokens.
          clientId: googleClientIds,
          clientSecret: config.googleClientSecret as string,
        },
      }
    : {},
  // Native apps persist the returned set-auth-token value in the platform
  // keychain/keystore and send it back as an Authorization bearer token.
  // Browser clients continue using the existing HttpOnly session cookie.
  plugins: [bearer({ requireSignature: true })],
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
      "/sign-in/social": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
});
