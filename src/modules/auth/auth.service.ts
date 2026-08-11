import bcrypt from "bcryptjs";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "crypto";
import jwt from "jsonwebtoken";
import config from "../../config";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { notificationService } from "../notification/notification.service";

type PublicUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: "admin" | "customer" | "driver";
  avatar_url: string | null;
  auth_provider: string | null;
  email_verified: boolean;
  phone_verified_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  avatarUrl: true,
  authProvider: true,
  emailVerified: true,
  phoneVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const toPublicUser = (user: SelectedUser): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role:
    user.role === "admin"
      ? "admin"
      : user.role === "driver"
        ? "driver"
        : "customer",
  avatar_url: user.avatarUrl,
  auth_provider: user.authProvider,
  email_verified: Boolean(user.emailVerified),
  phone_verified_at: user.phoneVerifiedAt,
  created_at: user.createdAt,
  updated_at: user.updatedAt,
});

const appError = (
  message: string,
  status: number,
): Error & { status: number } => Object.assign(new Error(message), { status });

const signJwtForUser = (user: PublicUser): string =>
  jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    config.jwtSecret as string,
    { expiresIn: "5d" },
  );

const sessionForUserId = async (userId: number) => {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });
  if (!record) throw appError("User not found", 404);
  const user = toPublicUser(record);
  return { token: signJwtForUser(user), user };
};

const signup = async (input: {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: string;
}): Promise<PublicUser> => {
  const { name, email, password, phone, role } = input;
  if (!name || name.trim().length < 2) {
    throw appError("Name is required and must be at least 2 characters", 400);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw appError("A valid email address is required", 400);
  }
  if (!password || password.length < 6) {
    throw appError("Password must be at least 6 characters", 400);
  }
  if (!phone || !/^\+?[0-9]{8,15}$/.test(phone)) {
    throw appError("A valid phone number is required (8-15 digits)", 400);
  }
  if (!["admin", "customer"].includes(role)) {
    throw appError("Role must be either 'admin' or 'customer'", 400);
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) throw appError("Email already registered", 400);

  const record = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      phone,
      role,
      password: await bcrypt.hash(password, 10),
      authProvider: "password",
    },
    select: userSelect,
  });
  return toPublicUser(record);
};

const signin = async (input: { email: string; password: string }) => {
  if (!input.email || !input.password)
    throw appError("Missing email or password", 400);
  const record = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { ...userSelect, password: true },
  });
  if (
    !record?.password ||
    !(await bcrypt.compare(input.password, record.password))
  ) {
    throw appError("Invalid email or password", 401);
  }
  const user = toPublicUser(record);
  return { token: signJwtForUser(user), user };
};

const providers = () => ({
  google: Boolean(config.googleClientId && config.googleClientSecret),
  phoneVerification: Boolean(
    config.twilioAccountSid &&
    config.twilioAuthToken &&
    config.twilioFromNumber,
  ),
});

const googleAuthorizationUrl = (): string => {
  if (!providers().google)
    throw appError("Google sign-in is not configured", 503);
  const state = jwt.sign(
    { purpose: "google_oauth", nonce: randomBytes(16).toString("hex") },
    config.jwtSecret as string,
    { expiresIn: "10m" },
  );
  const query = new URLSearchParams({
    client_id: config.googleClientId as string,
    redirect_uri: config.googleCallbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
};

const exchangeGoogleProfile = async (code: string): Promise<GoogleProfile> => {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId as string,
      client_secret: config.googleClientSecret as string,
      redirect_uri: config.googleCallbackUrl,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok)
    throw appError("Google authorization could not be completed", 401);
  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token)
    throw appError("Google did not return an access token", 401);

  const profileResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    },
  );
  if (!profileResponse.ok)
    throw appError("Google profile could not be verified", 401);
  const profile = (await profileResponse.json()) as GoogleProfile;
  if (!profile.sub || !profile.email || !profile.email_verified) {
    throw appError("A verified Google email is required", 401);
  }
  return profile;
};

const linkGoogleUser = async (profile: GoogleProfile): Promise<number> => {
  const normalizedEmail = profile.email.toLowerCase();
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ googleSubject: profile.sub }, { email: normalizedEmail }],
    },
    select: { id: true, googleSubject: true },
  });
  if (!existing) {
    const created = await prisma.user.create({
      data: {
        name:
          profile.name || normalizedEmail.split("@")[0] || "Roadly customer",
        email: normalizedEmail,
        role: "customer",
        googleSubject: profile.sub,
        avatarUrl: profile.picture ?? null,
        authProvider: "google",
        emailVerified: true,
      },
      select: { id: true },
    });
    return created.id;
  }
  if (existing.googleSubject && existing.googleSubject !== profile.sub) {
    throw appError(
      "This email is already linked to another Google account",
      409,
    );
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      googleSubject: profile.sub,
      ...(profile.picture ? { avatarUrl: profile.picture } : {}),
      emailVerified: true,
      updatedAt: new Date(),
    },
  });
  return existing.id;
};

const completeGoogleCallback = async (
  code: string,
  state: string,
): Promise<string> => {
  if (!code || !state) throw appError("Google callback is incomplete", 400);
  try {
    const payload = jwt.verify(state, config.jwtSecret as string) as {
      purpose?: string;
    };
    if (payload.purpose !== "google_oauth")
      throw new Error("Wrong state purpose");
  } catch {
    throw appError("Google sign-in state is invalid or expired", 401);
  }
  const profile = await exchangeGoogleProfile(code);
  const userId = await linkGoogleUser(profile);
  const exchangeCode = randomBytes(32).toString("base64url");
  await prisma.authExchangeCode.create({
    data: {
      userId,
      codeHash: createHash("sha256").update(exchangeCode).digest("hex"),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  return exchangeCode;
};

const exchangeGoogleCode = async (code: string) => {
  if (!code) throw appError("Exchange code is required", 400);
  const codeHash = createHash("sha256").update(code).digest("hex");
  const rows = await prisma.$queryRaw<Array<{ user_id: number }>>(Prisma.sql`
    DELETE FROM auth_exchange_codes
    WHERE code_hash = ${codeHash} AND expires_at > NOW()
    RETURNING user_id
  `);
  if (rows.length === 0)
    throw appError("Sign-in code is invalid or expired", 401);
  return sessionForUserId(Number(rows[0]?.user_id));
};

const verificationHash = (
  userId: number,
  phone: string,
  code: string,
): string =>
  createHmac("sha256", config.jwtSecret as string)
    .update(`${userId}:${phone}:${code}`)
    .digest("hex");

const sendPhoneCode = async (userId: number, phone: string) => {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    throw appError(
      "Use an international phone number such as +60123456789",
      400,
    );
  }
  const duplicate = await prisma.user.findFirst({
    where: { phone, phoneVerifiedAt: { not: null }, id: { not: userId } },
    select: { id: true },
  });
  if (duplicate) throw appError("Phone number is already in use", 409);
  const recent = await prisma.phoneVerificationCode.findFirst({
    where: {
      userId,
      createdAt: { gt: new Date(Date.now() - 60 * 1000) },
    },
    select: { id: true },
  });
  if (recent)
    throw appError(
      "Please wait one minute before requesting another code",
      429,
    );

  const code = randomInt(100000, 1000000).toString();
  const verification = await prisma.$transaction(async (transaction) => {
    await transaction.phoneVerificationCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return transaction.phoneVerificationCode.create({
      data: {
        userId,
        phone,
        codeHash: verificationHash(userId, phone, code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      select: { id: true },
    });
  });

  let sent = false;
  try {
    sent = await notificationService.sendPhoneVerification(phone, code);
  } catch (error) {
    await prisma.phoneVerificationCode.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    });
    throw error;
  }
  if (!sent && config.nodeEnv === "production") {
    throw appError("Phone verification is not configured", 503);
  }
  return {
    phone: `${phone.slice(0, 3)}••••${phone.slice(-3)}`,
    expiresInSeconds: 600,
    ...(sent || config.nodeEnv === "production"
      ? {}
      : { developmentCode: code }),
  };
};

const verifyPhoneCode = async (userId: number, code: string) => {
  if (!/^\d{6}$/.test(code))
    throw appError("Enter the six-digit verification code", 400);
  const verification = await prisma.phoneVerificationCode.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!verification || verification.attempts >= 5) {
    throw appError("Verification code is expired. Request a new code", 400);
  }
  const actual = Buffer.from(
    verificationHash(userId, verification.phone, code),
    "hex",
  );
  const expected = Buffer.from(verification.codeHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    await prisma.phoneVerificationCode.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });
    throw appError("The verification code is incorrect", 400);
  }
  await prisma.$transaction([
    prisma.phoneVerificationCode.update({
      where: { id: verification.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        phone: verification.phone,
        phoneVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    }),
  ]);
  return sessionForUserId(userId);
};

export const authService = {
  signup,
  signin,
  providers,
  googleAuthorizationUrl,
  completeGoogleCallback,
  exchangeGoogleCode,
  sendPhoneCode,
  verifyPhoneCode,
};
