import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
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

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] as string,
  );

const sendPasswordResetEmail = async (input: {
  email: string;
  name: string;
  url: string;
}): Promise<void> => {
  if (!config.resendApiKey || !config.emailFrom) {
    if (config.nodeEnv !== "production") {
      console.info(
        `Roadly password reset link for ${input.email}: ${input.url}`,
      );
      return;
    }
    throw new Error("Password reset email is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [input.email],
      subject: "Reset your Roadly password",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#071821"><h1>Reset your Roadly password</h1><p>Hello ${escapeHtml(input.name)},</p><p>Use the secure link below to choose a new password. It expires in ${Math.ceil(config.passwordResetTokenExpiresInSeconds / 60)} minutes and can only be used once.</p><p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#071821;color:#ffffff;text-decoration:none;font-weight:700">Reset password</a></p><p>If you did not request this, you can safely ignore this email.</p></div>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Password reset email failed with ${response.status}`);
  }
};

const hashRoadlyPassword = async (password: string): Promise<string> => {
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw APIError.from("BAD_REQUEST", {
      code: "PASSWORD_TOO_WEAK",
      message:
        "Password must include uppercase, lowercase, number, and symbol",
    });
  }
  return bcrypt.hash(password, 12);
};

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
    resetPasswordTokenExpiresIn: config.passwordResetTokenExpiresInSeconds,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        url,
      });
    },
    password: {
      hash: hashRoadlyPassword,
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
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },
});
