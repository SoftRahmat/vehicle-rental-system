import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { vehicleService } from "./vehicle.service";

/**
 * GET /api/v1/vehicles
 */
const getAllVehicles = asyncHandler(async (_req: Request, res: Response) => {
  const vehicles = await vehicleService.getAllVehicles();
  if (vehicles.length === 0) {
    return res.status(200).json(
      {
        success: true,
        message: "No vehicles found",
        data: []
      }
    );
  }

  res.status(200).json(
    {
      success: true,
      message: "Vehicles retrieved successfully",
      data: vehicles
    }
  );
});

/**
 * GET /api/v1/vehicles/:vehicleId
 */
const getVehicleById = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  const v = await vehicleService.getVehicleById(Number(vehicleId));
  res.status(200).json(
    {
      success: true,
      message: "Vehicle retrieved successfully",
      data: v 
    }
  );
});

/**
 * POST /api/v1/vehicles  (Admin)
 */
const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json(
      {
        success: false,
        message: "Bad Request: body required",
        errors: "Provide vehicle data"
      }
    );
  }

  const created = await vehicleService.createVehicle(payload);
  res.status(201).json(
    {
      success: true,
      message: "Vehicle created successfully",
      data: created
    }
  );
});

/**
 * PUT /api/v1/vehicles/:vehicleId  (Admin)
 */
const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  const payload = req.body;
  if (!payload || Object.keys(payload).length === 0) {
    return res.status(400).json(
      { 
        success: false,
        message: "Bad Request: body required",
        errors: "Provide fields to update"
      }
    );
  }

  const updated = await vehicleService.updateVehicle(Number(vehicleId), payload);
  res.status(200).json(
    {
      success: true,
      message: "Vehicle updated successfully",
      data: updated
    }
  );
});

/**
 * DELETE /api/v1/vehicles/:vehicleId  (Admin)
 */
const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  await vehicleService.deleteVehicle(Number(vehicleId));
  res.status(200).json(
    { 
      success: true,
      message: "Vehicle deleted successfully"
    }
  );
});

export const vehicleController = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle
}
