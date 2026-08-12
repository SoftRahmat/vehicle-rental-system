import type { Request, Response } from "express";
import type { AuthUser } from "../../types/express";
import { asyncHandler } from "../../utils/asyncHandler";
import { rideReviewService } from "./ride-review.service";

const actor = (req: Request) => req.user as AuthUser;
const rideId = (req: Request) => Number(req.params["rideId"]);
const getForRide = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Ride feedback retrieved",
    data: await rideReviewService.getForRide(rideId(req), actor(req)),
  }),
);
const create = asyncHandler(async (req: Request, res: Response) =>
  res
    .status(201)
    .json({
      success: true,
      message: "Thank you for your feedback",
      data: await rideReviewService.create(
        rideId(req),
        req.body ?? {},
        actor(req),
      ),
    }),
);
const update = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Feedback updated",
    data: await rideReviewService.update(
      rideId(req),
      req.body ?? {},
      actor(req),
    ),
  }),
);
const driverSummary = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Rating summary retrieved",
    data: await rideReviewService.driverSummary(actor(req)),
  }),
);
const driverReviews = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Driver feedback retrieved",
    data: await rideReviewService.driverReviews(req.query, actor(req)),
  }),
);
const adminReviews = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Review moderation queue retrieved",
    data: await rideReviewService.adminReviews(req.query),
  }),
);
const moderate = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Review moderation updated",
    data: await rideReviewService.moderate(
      Number(req.params["reviewId"]),
      req.body ?? {},
      actor(req),
    ),
  }),
);
export const rideReviewController = {
  getForRide,
  create,
  update,
  driverSummary,
  driverReviews,
  adminReviews,
  moderate,
};
