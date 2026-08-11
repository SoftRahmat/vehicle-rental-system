import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { adminController } from "./admin.controller";
import { supportController } from "../support/support.controller";
import { rideController } from "../ride/ride.controller";

export const adminRouter = Router();

adminRouter.use(authGate.requireAuth, authGate.requireRole("admin"));
adminRouter.get("/dashboard/stats", adminController.getDashboardStats);
adminRouter.get("/vehicles", adminController.getVehicles);
adminRouter.get("/bookings", adminController.getBookings);
adminRouter.get("/users", adminController.getUsers);
adminRouter.get("/support/tickets", supportController.getAdminTickets);
adminRouter.get(
  "/support/tickets/:ticketId",
  supportController.getConversation,
);
adminRouter.post(
  "/support/tickets/:ticketId/messages",
  supportController.sendMessage,
);
adminRouter.patch("/support/tickets/:ticketId", supportController.updateTicket);
adminRouter.get("/rides", rideController.adminRides);
adminRouter.get("/drivers", rideController.drivers);
adminRouter.post("/drivers", rideController.createDriver);
adminRouter.patch("/drivers/:driverId", rideController.updateDriver);
adminRouter.post("/rides/:rideId/assign", rideController.assignDriver);
adminRouter.patch("/rides/:rideId/status", rideController.updateStatus);
adminRouter.patch("/rides/:rideId/charges", rideController.adjustRideCharges);
