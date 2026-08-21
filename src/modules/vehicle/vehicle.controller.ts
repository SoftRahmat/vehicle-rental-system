import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { vehicleService } from "./vehicle.service";

/**
 * GET /api/v1/vehicles
 */
const getAllVehicles = asyncHandler(async (req: Request, res: Response) => {
  const startDate =
    typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate =
    typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const vehicles = await vehicleService.getAllVehicles(startDate, endDate);
  if (vehicles.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No vehicles found",
      data: [],
    });
  }

  res.status(200).json({
    success: true,
    message: "Vehicles retrieved successfully",
    data: vehicles,
  });
});

const getVehicleCatalog = asyncHandler(async (req: Request, res: Response) => {
  const data = await vehicleService.getVehicleCatalog(
    req.query as Record<string, unknown>,
  );
  res.status(200).json({
    success: true,
    message: "Vehicle catalogue retrieved successfully",
    data,
  });
});

/**
 * GET /api/v1/vehicles/:vehicleId
 */
const getVehicleById = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  const v = await vehicleService.getVehicleById(Number(vehicleId));
  res.status(200).json({
    success: true,
    message: "Vehicle retrieved successfully",
    data: v,
  });
});

const getAvailabilityQuote = asyncHandler(
  async (req: Request, res: Response) => {
    const { vehicleId } = req.params;
    const startDate =
      typeof req.query.startDate === "string" ? req.query.startDate : "";
    const endDate =
      typeof req.query.endDate === "string" ? req.query.endDate : "";
    const quote = await vehicleService.getAvailabilityQuote(
      Number(vehicleId),
      startDate,
      endDate,
      {
        pickupLocation:
          typeof req.query.pickupLocation === "string"
            ? req.query.pickupLocation
            : undefined,
        returnLocation:
          typeof req.query.returnLocation === "string"
            ? req.query.returnLocation
            : undefined,
        pickupTime:
          typeof req.query.pickupTime === "string"
            ? req.query.pickupTime
            : undefined,
        returnTime:
          typeof req.query.returnTime === "string"
            ? req.query.returnTime
            : undefined,
        insurancePlan:
          typeof req.query.insurancePlan === "string"
            ? req.query.insurancePlan
            : undefined,
        addOns:
          typeof req.query.addOns === "string" && req.query.addOns
            ? req.query.addOns.split(",")
            : [],
        specialRequests:
          typeof req.query.specialRequests === "string"
            ? req.query.specialRequests
            : undefined,
        promoCode:
          typeof req.query.promoCode === "string"
            ? req.query.promoCode
            : undefined,
      },
      typeof req.query.displayCurrency === "string"
        ? req.query.displayCurrency
        : undefined,
    );

    res.status(200).json({
      success: true,
      message: quote.available
        ? "Vehicle is available for the selected dates"
        : "Vehicle is unavailable for the selected dates",
      data: quote,
    });
  },
);

const getUnavailableRanges = asyncHandler(
  async (req: Request, res: Response) => {
    const { vehicleId } = req.params;
    const ranges = await vehicleService.getUnavailableRanges(Number(vehicleId));
    res.status(200).json({
      success: true,
      message: "Unavailable dates retrieved successfully",
      data: ranges,
    });
  },
);

/**
 * POST /api/v1/vehicles  (Admin)
 */
const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Bad Request: body required",
      errors: "Provide vehicle data",
    });
  }

  const created = await vehicleService.createVehicle(payload);
  res.status(201).json({
    success: true,
    message: "Vehicle created successfully",
    data: created,
  });
});

/**
 * PUT /api/v1/vehicles/:vehicleId  (Admin)
 */
const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  const payload = req.body;
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Bad Request: body required",
      errors: "Provide fields to update",
    });
  }

  const updated = await vehicleService.updateVehicle(
    Number(vehicleId),
    payload,
  );
  res.status(200).json({
    success: true,
    message: "Vehicle updated successfully",
    data: updated,
  });
});

/**
 * DELETE /api/v1/vehicles/:vehicleId  (Admin)
 */
const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  await vehicleService.deleteVehicle(Number(vehicleId));
  res.status(200).json({
    success: true,
    message: "Vehicle deleted successfully",
  });
});

export const vehicleController = {
  getAllVehicles,
  getVehicleCatalog,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getAvailabilityQuote,
  getUnavailableRanges,
};
