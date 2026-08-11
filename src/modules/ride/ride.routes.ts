import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { rideController } from "./ride.controller";

export const rideRouter = Router();

rideRouter.get("/options", rideController.options);
rideRouter.use(authGate.requireAuth, authGate.requireRole("customer"));
rideRouter.get("/", rideController.mine);
rideRouter.post("/quote", authGate.requireVerifiedPhone, rideController.quote);
rideRouter.post("/", authGate.requireVerifiedPhone, rideController.create);
rideRouter.post("/:rideId/cancel", rideController.cancel);

export const driverRideRouter = Router();
driverRideRouter.use(authGate.requireAuth, authGate.requireRole("driver"));
driverRideRouter.get("/profile", rideController.driverProfile);
driverRideRouter.patch(
  "/availability",
  rideController.updateDriverAvailability,
);
driverRideRouter.patch("/location", rideController.updateDriverLocation);
driverRideRouter.get("/active", rideController.driverActiveRide);
driverRideRouter.post("/:rideId/reject", rideController.rejectDriverRide);
driverRideRouter.patch(
  "/:rideId/status",
  rideController.updateDriverRideStatus,
);
