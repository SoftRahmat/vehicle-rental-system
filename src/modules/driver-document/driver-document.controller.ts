import type { Request, Response } from "express";
import type { AuthUser } from "../../types/express";
import { asyncHandler } from "../../utils/asyncHandler";
import { driverDocumentService } from "./driver-document.service";
const actor = (req: Request) => req.user as AuthUser;
const mine = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Driver documents retrieved",
    data: await driverDocumentService.mine(actor(req)),
  }),
);
const save = asyncHandler(async (req: Request, res: Response) =>
  res
    .status(201)
    .json({
      success: true,
      message: "Document submitted for review",
      data: await driverDocumentService.save(req.body ?? {}, actor(req)),
    }),
);
const adminList = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Driver compliance queue retrieved",
    data: await driverDocumentService.adminList(req.query),
  }),
);
const review = asyncHandler(async (req: Request, res: Response) =>
  res.json({
    success: true,
    message: "Document review saved",
    data: await driverDocumentService.review(
      Number(req.params["documentId"]),
      req.body ?? {},
      actor(req),
    ),
  }),
);
export const driverDocumentController = { mine, save, adminList, review };
