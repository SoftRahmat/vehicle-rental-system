import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { authService } from "./auth.service";

/**
 * Signup controller
 */
const signup = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, phone } = req.body;

  const created = await authService.signup({
    name,
    email,
    password,
    phone,
    // Public signup is customer-only. Admin roles are managed by an existing admin.
    role: "customer",
  });

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: created,
  });
});

/**
 * Signin controller
 * Returns token + user (without password)
 */
const signin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.signin({ email, password });

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: result,
  });
});

const providers = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Authentication providers retrieved successfully",
    data: authService.providers(),
  });
});

const startGoogle = asyncHandler(async (_req: Request, res: Response) => {
  res.redirect(authService.googleAuthorizationUrl());
});

const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const exchangeCode = await authService.completeGoogleCallback(code, state);
  const frontendUrl = (
    process.env.FRONTEND_URL ?? "http://localhost:4200"
  ).replace(/\/$/, "");
  res.redirect(
    `${frontendUrl}/auth/callback?code=${encodeURIComponent(exchangeCode)}`,
  );
});

const exchangeGoogleCode = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.exchangeGoogleCode(req.body?.code);
  res.status(200).json({
    success: true,
    message: "Google sign-in successful",
    data: result,
  });
});

const sendPhoneCode = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.sendPhoneCode(
    Number(req.user?.id),
    req.body?.phone,
  );
  res
    .status(200)
    .json({ success: true, message: "Verification code sent", data: result });
});

const verifyPhoneCode = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.verifyPhoneCode(
    Number(req.user?.id),
    req.body?.code,
  );
  res
    .status(200)
    .json({ success: true, message: "Phone number verified", data: result });
});

export const authController = {
  signup,
  signin,
  providers,
  startGoogle,
  googleCallback,
  exchangeGoogleCode,
  sendPhoneCode,
  verifyPhoneCode,
};
