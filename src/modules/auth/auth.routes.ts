import { Router } from "express";
import { authController } from "./auth.controller";
import { authGate } from "../../middleware/auth";

export const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/signin", authController.signin);
authRouter.get("/providers", authController.providers);
authRouter.get("/google", authController.startGoogle);
authRouter.get("/google/callback", authController.googleCallback);
authRouter.post("/google/exchange", authController.exchangeGoogleCode);
authRouter.post(
  "/phone/send-code",
  authGate.requireAuth,
  authController.sendPhoneCode,
);
authRouter.post(
  "/phone/verify",
  authGate.requireAuth,
  authController.verifyPhoneCode,
);
