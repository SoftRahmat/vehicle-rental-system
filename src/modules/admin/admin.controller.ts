import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { adminService } from "./admin.service";

const queryInput = (req: Request): Record<string, unknown> =>
  req.query as Record<string, unknown>;

const getVehicles = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.getVehicles(queryInput(req));
  res
    .status(200)
    .json({ success: true, message: "Admin vehicles retrieved", data });
});

const getBookings = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.getBookings(queryInput(req));
  res
    .status(200)
    .json({ success: true, message: "Admin bookings retrieved", data });
});

const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminService.getUsers(queryInput(req));
  res
    .status(200)
    .json({ success: true, message: "Admin users retrieved", data });
});

const getDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const data = await adminService.getDashboardStats();
  res
    .status(200)
    .json({ success: true, message: "Admin statistics retrieved", data });
});

export const adminController = {
  getVehicles,
  getBookings,
  getUsers,
  getDashboardStats,
};
