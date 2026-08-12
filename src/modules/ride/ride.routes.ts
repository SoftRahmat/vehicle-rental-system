import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { rideController } from "./ride.controller";
import { rideReviewController } from "../ride-review/ride-review.controller";
import { driverEarningController } from "../driver-earning/driver-earning.controller";
import { driverDocumentController } from "../driver-document/driver-document.controller";
import { driverSafetyController } from "../driver-safety/driver-safety.controller";

export const rideRouter = Router();

rideRouter.get("/options", rideController.options);
rideRouter.use(authGate.requireAuth, authGate.requireRole("customer"));
rideRouter.get("/", rideController.mine);
rideRouter.post("/quote", authGate.requireVerifiedPhone, rideController.quote);
rideRouter.post("/", authGate.requireVerifiedPhone, rideController.create);
rideRouter.post("/:rideId/cancel", rideController.cancel);
rideRouter.get("/:rideId/review", rideReviewController.getForRide);
rideRouter.post("/:rideId/review", rideReviewController.create);
rideRouter.patch("/:rideId/review", rideReviewController.update);

export const driverRideRouter = Router();
driverRideRouter.use(authGate.requireAuth, authGate.requireRole("driver"));
driverRideRouter.get("/profile", rideController.driverProfile);
driverRideRouter.patch(
  "/availability",
  rideController.updateDriverAvailability,
);
driverRideRouter.patch("/location", rideController.updateDriverLocation);
driverRideRouter.get("/active", rideController.driverActiveRide);
driverRideRouter.get("/history", rideController.driverRideHistory);
driverRideRouter.get("/ratings/summary", rideReviewController.driverSummary);
driverRideRouter.get("/ratings", rideReviewController.driverReviews);
driverRideRouter.get("/earnings/summary", driverEarningController.summary);
driverRideRouter.get("/earnings", driverEarningController.earnings);
driverRideRouter.get("/payouts", driverEarningController.payouts);
driverRideRouter.get("/documents", driverDocumentController.mine);
driverRideRouter.post("/documents", driverDocumentController.save);
driverRideRouter.get("/incidents", driverSafetyController.mine);
driverRideRouter.post("/incidents", driverSafetyController.create);
driverRideRouter.get("/performance", driverSafetyController.performance);
driverRideRouter.post("/:rideId/reject", rideController.rejectDriverRide);
driverRideRouter.post("/:rideId/accept", rideController.acceptDriverRide);
driverRideRouter.patch(
  "/:rideId/status",
  rideController.updateDriverRideStatus,
);
