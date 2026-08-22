import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { paymentController } from "./payment.controller";

export const paymentRouter = Router();

paymentRouter.get("/status", paymentController.getIntegrationStatus);
paymentRouter.get("/mobile-return", paymentController.mobileReturn);
paymentRouter.post(
  "/bookings/:bookingId/checkout",
  authGate.requireAuth,
  paymentController.createCheckoutSession,
);
paymentRouter.post(
  "/rides/:rideId/checkout",
  authGate.requireAuth,
  authGate.requireAnyRole(["customer", "admin"]),
  paymentController.createRideCheckoutSession,
);
