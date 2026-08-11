import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import type { AuthUser } from "../../types/express/index";
import { paymentService } from "./payment.service";

const getIntegrationStatus = asyncHandler(
  async (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: "Integration status retrieved successfully",
      data: paymentService.integrationStatus(),
    });
  },
);

const createCheckoutSession = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = req.user as AuthUser;
    const result = await paymentService.createCheckoutSession(
      Number(req.params["bookingId"]),
      actor,
    );
    res.status(201).json({
      success: true,
      message: "Stripe Checkout session created successfully",
      data: result,
    });
  },
);

const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "Stripe signature is required" });
  }
  const result = await paymentService.handleWebhook(
    req.body as Buffer,
    signature,
  );
  return res
    .status(200)
    .json({ success: true, message: "Webhook received", data: result });
});

const createRideCheckoutSession = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await paymentService.createRideCheckoutSession(
      Number(req.params["rideId"]),
      req.user as AuthUser,
    );
    res
      .status(201)
      .json({
        success: true,
        message: "MYR ride checkout created",
        data: result,
      });
  },
);

export const paymentController = {
  getIntegrationStatus,
  createCheckoutSession,
  stripeWebhook,
  createRideCheckoutSession,
};
