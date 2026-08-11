import type { Request, Response } from "express";
import type { AuthUser } from "../../types/express/index";
import { asyncHandler } from "../../utils/asyncHandler";
import { rideService } from "./ride.service";
import { realtimeGateway } from "../realtime/realtime.gateway";
import { rideNotificationService } from "../ride-notification/ride-notification.service";
import { paymentService } from "../payment/payment.service";

const options = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Ride options retrieved",
    data: await rideService.publicOptions(),
  });
});

const quote = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideService.quote(req.body, req.user as AuthUser);
  res.json({
    success: true,
    message: "Fare calculated for the current route",
    data,
  });
});

const create = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideService.createRide(
    req.body?.quoteToken,
    req.user as AuthUser,
  );
  realtimeGateway.publishRide(data);
  void rideNotificationService.notifyRideUpdate(data).catch(console.error);
  res.status(201).json({
    success: true,
    message:
      data.paymentMethod === "card"
        ? "Ride created. Authorize your card to start dispatch"
        : "Ride requested. Roadly dispatch is finding your driver",
    data,
  });
});

const mine = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Your rides retrieved",
    data: await rideService.myRides(req.user as AuthUser),
  });
});

const cancel = asyncHandler(async (req: Request, res: Response) => {
  let data = await rideService.cancelRide(
    Number(req.params["rideId"]),
    req.body?.reason,
    req.user as AuthUser,
  );
  if (data.paymentMethod === "card") {
    const paymentStatus = await paymentService.settleCancelledRidePayment(
      data.id,
    );
    data = { ...data, paymentStatus };
  }
  realtimeGateway.publishRide(data);
  void rideNotificationService.notifyRideUpdate(data).catch(console.error);
  res.json({ success: true, message: "Ride cancelled", data });
});

const adminRides = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Dispatch queue retrieved",
    data: await rideService.adminRides(req.query),
  });
});

const drivers = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Drivers retrieved",
    data: await rideService.drivers(),
  });
});

const createDriver = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideService.createDriver(req.body);
  res
    .status(201)
    .json({ success: true, message: "Driver profile created", data });
});

const updateDriver = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideService.updateDriver(
    Number(req.params["driverId"]),
    req.body,
  );
  res.json({ success: true, message: "Driver updated", data });
});

const assignDriver = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideService.assignDriver(
    Number(req.params["rideId"]),
    Number(req.body?.driverId),
    req.user as AuthUser,
  );
  realtimeGateway.publishRide(data);
  void rideNotificationService.notifyRideUpdate(data).catch(console.error);
  res.json({ success: true, message: "Driver assigned", data });
});

const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  let data = await rideService.updateStatus(
    Number(req.params["rideId"]),
    req.body?.status,
    req.body?.note,
    req.user as AuthUser,
  );
  if (data.status === "completed" && data.paymentMethod === "card") {
    const paymentStatus = await paymentService.captureAuthorizedRidePayment(
      data.id,
    );
    data = { ...data, paymentStatus };
  }
  realtimeGateway.publishRide(data);
  void rideNotificationService.notifyRideUpdate(data).catch(console.error);
  res.json({ success: true, message: "Ride status updated", data });
});

const driverProfile = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Driver profile retrieved",
    data: await rideService.driverProfile(req.user as AuthUser),
  });
});

const updateDriverAvailability = asyncHandler(
  async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Driver availability updated",
      data: await rideService.updateDriverAvailability(
        req.body?.availability,
        req.user as AuthUser,
      ),
    });
  },
);

const updateDriverLocation = asyncHandler(
  async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Driver location updated",
      data: await rideService.updateDriverLocation(
        Number(req.body?.lat),
        Number(req.body?.lng),
        req.user as AuthUser,
      ),
    });
  },
);

const driverActiveRide = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Active driver ride retrieved",
    data: await rideService.driverActiveRide(req.user as AuthUser),
  });
});

const updateDriverRideStatus = asyncHandler(
  async (req: Request, res: Response) => {
    let data = await rideService.updateDriverRideStatus(
      Number(req.params["rideId"]),
      req.body?.status,
      req.body ?? {},
      req.user as AuthUser,
    );
    if (data.status === "completed" && data.paymentMethod === "card") {
      const paymentStatus = await paymentService.captureAuthorizedRidePayment(
        data.id,
      );
      data = { ...data, paymentStatus };
    }
    realtimeGateway.publishRide(data);
    void rideNotificationService.notifyRideUpdate(data).catch(console.error);
    if (
      data.status === "completed" &&
      data.paymentStatus === "cash_collected"
    ) {
      void rideNotificationService
        .sendRideReceipt(data.id)
        .catch(console.error);
    }
    res.json({ success: true, message: "Ride status updated", data });
  },
);

const rejectDriverRide = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideService.rejectDriverRide(
    Number(req.params["rideId"]),
    req.body ?? {},
    req.user as AuthUser,
  );
  realtimeGateway.publishRide(data);
  void rideNotificationService
    .notifyDriverRejection(data, String(req.body?.reason ?? "other"))
    .catch(console.error);
  res.json({
    success: true,
    message: data.driverId
      ? "Ride rejected and reassigned to another driver"
      : "Ride rejected. Roadly is finding another driver",
    data,
  });
});

const adjustRideCharges = asyncHandler(async (req: Request, res: Response) => {
  const data = await rideService.adjustRideCharges(
    Number(req.params["rideId"]),
    req.body ?? {},
  );
  realtimeGateway.publishRide(data);
  res.json({ success: true, message: "Ride charges updated", data });
});

export const rideController = {
  options,
  quote,
  create,
  mine,
  cancel,
  adminRides,
  drivers,
  createDriver,
  updateDriver,
  assignDriver,
  updateStatus,
  driverProfile,
  updateDriverAvailability,
  updateDriverLocation,
  driverActiveRide,
  updateDriverRideStatus,
  rejectDriverRide,
  adjustRideCharges,
};
