import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { rideNotificationService } from "./ride-notification.service";
import config from "../../config";

const configInfo = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Push configuration retrieved",
    data: {
      enabled: Boolean(config.vapidPublicKey && config.vapidPrivateKey),
      publicKey: config.vapidPublicKey ?? null,
    },
  });
});
const list = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Notifications retrieved",
    data: await rideNotificationService.list(Number(req.user?.id)),
  });
});
const markRead = asyncHandler(async (req: Request, res: Response) => {
  await rideNotificationService.markRead(
    Number(req.params["notificationId"]),
    Number(req.user?.id),
  );
  res.json({
    success: true,
    message: "Notification marked as read",
    data: null,
  });
});
const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideNotificationService.subscribe(
    Number(req.user?.id),
    req.body,
  );
  res
    .status(201)
    .json({ success: true, message: "Push notifications enabled", data });
});

export const rideNotificationController = {
  configInfo,
  list,
  markRead,
  subscribe,
};
