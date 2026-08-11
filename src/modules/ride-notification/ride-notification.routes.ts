import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { rideNotificationController } from "./ride-notification.controller";

export const rideNotificationRouter = Router();
rideNotificationRouter.use(authGate.requireAuth);
rideNotificationRouter.get("/config", rideNotificationController.configInfo);
rideNotificationRouter.get("/", rideNotificationController.list);
rideNotificationRouter.patch(
  "/:notificationId/read",
  rideNotificationController.markRead,
);
rideNotificationRouter.post(
  "/push-subscriptions",
  rideNotificationController.subscribe,
);
