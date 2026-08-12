import type { Request, Response } from "express";
import type { AuthUser } from "../../types/express";
import { asyncHandler } from "../../utils/asyncHandler";
import { driverEarningService } from "./driver-earning.service";
const actor = (req: Request) => req.user as AuthUser;
const summary = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Earnings summary retrieved",
    data: await driverEarningService.summary(actor(req)),
  }),
);
const earnings = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Earnings retrieved",
    data: await driverEarningService.earnings(req.query, actor(req)),
  }),
);
const payouts = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Payouts retrieved",
    data: await driverEarningService.payouts(req.query, actor(req)),
  }),
);
const adminPayouts = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Driver payouts retrieved",
    data: await driverEarningService.adminPayouts(req.query),
  }),
);
const balances = asyncHandler(async (_req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Driver balances retrieved",
    data: await driverEarningService.balances(),
  }),
);
const createPayout = asyncHandler(async (req: Request, res: Response) =>
  res.status(201).json({
    success: true,
    message: "Draft payout created",
    data: await driverEarningService.createPayout(req.body ?? {}),
  }),
);
const updatePayout = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Payout updated",
    data: await driverEarningService.updatePayout(
      Number(req.params["payoutId"]),
      req.body ?? {},
      actor(req),
    ),
  }),
);
const addAdjustment = asyncHandler(async (req: Request, res: Response) =>
  res.status(201).json({
    success: true,
    message: "Earning adjustment recorded",
    data: await driverEarningService.addAdjustment(
      Number(req.params["earningId"]),
      req.body ?? {},
      actor(req),
    ),
  }),
);
export const driverEarningController = {
  summary,
  earnings,
  payouts,
  adminPayouts,
  balances,
  createPayout,
  updatePayout,
  addAdjustment,
};
