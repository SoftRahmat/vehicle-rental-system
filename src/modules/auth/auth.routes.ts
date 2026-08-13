import { Router } from "express";
import { authController } from "./auth.controller";
import { authGate } from "../../middleware/auth";
import {
  credentialRateLimit,
  verificationRateLimit,
} from "../../middleware/auth-rate-limit";

export const authRouter = Router();

authRouter.post("/signup", credentialRateLimit, authController.signup);
authRouter.post("/signin", credentialRateLimit, authController.signin);
authRouter.get("/me", authGate.requireAuth, authController.me);
authRouter.get("/providers", authController.providers);
authRouter.post(
  "/phone/send-code",
  verificationRateLimit,
  authGate.requireAuth,
  authController.sendPhoneCode,
);
authRouter.post(
  "/phone/verify",
  verificationRateLimit,
  authGate.requireAuth,
  authController.verifyPhoneCode,
);
