import { Router } from "express";
import { vehicleController } from "./vehicle.controller";
import { authGate } from "../../middleware/auth";

export const vehicleRouter = Router();

/**
 * Public
 */
vehicleRouter.get("/", vehicleController.getAllVehicles);
vehicleRouter.get("/catalog", vehicleController.getVehicleCatalog);
vehicleRouter.get(
  "/:vehicleId/availability",
  vehicleController.getAvailabilityQuote,
);
vehicleRouter.get(
  "/:vehicleId/unavailable-dates",
  vehicleController.getUnavailableRanges,
);
vehicleRouter.get("/:vehicleId", vehicleController.getVehicleById);

/**
 * Admin only
 */
vehicleRouter.post(
  "/",
  authGate.requireAuth,
  authGate.requireRole("admin"),
  vehicleController.createVehicle,
);
vehicleRouter.put(
  "/:vehicleId",
  authGate.requireAuth,
  authGate.requireRole("admin"),
  vehicleController.updateVehicle,
);
vehicleRouter.delete(
  "/:vehicleId",
  authGate.requireAuth,
  authGate.requireRole("admin"),
  vehicleController.deleteVehicle,
);
