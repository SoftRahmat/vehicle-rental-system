import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { paymentController } from "./payment.controller";

export const paymentRouter = Router();

paymentRouter.get("/status", paymentController.getIntegrationStatus);
paymentRouter.post(
  "/bookings/:bookingId/checkout",
  authGate.requireAuth,
  paymentController.createCheckoutSession,
);
