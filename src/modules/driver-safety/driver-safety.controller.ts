import type { Request, Response } from "express";
import type { AuthUser } from "../../types/express";
import { asyncHandler } from "../../utils/asyncHandler";
import { driverSafetyService } from "./driver-safety.service";
const actor = (req: Request) => req.user as AuthUser;
const mine = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Incidents retrieved",
    data: await driverSafetyService.mine(actor(req)),
  }),
);
const create = asyncHandler(async (req: Request, res: Response) =>
  res
    .status(201)
    .json({
      success: true,
      message: "Incident reported to Roadly safety",
      data: await driverSafetyService.create(req.body ?? {}, actor(req)),
    }),
);
const performance = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Performance retrieved",
    data: await driverSafetyService.performance(actor(req)),
  }),
);
const adminList = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Safety queue retrieved",
    data: await driverSafetyService.adminList(req.query),
  }),
);
const review = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Investigation updated",
    data: await driverSafetyService.review(
      Number(req.params["incidentId"]),
      req.body ?? {},
      actor(req),
    ),
  }),
);
const risk = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Driver risk status updated",
    data: await driverSafetyService.risk(
      Number(req.params["driverId"]),
      req.body ?? {},
      actor(req),
    ),
  }),
);
export const driverSafetyController = {
  mine,
  create,
  performance,
  adminList,
  review,
  risk,
};
