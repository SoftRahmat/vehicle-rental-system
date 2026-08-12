import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { adminController } from "./admin.controller";
import { supportController } from "../support/support.controller";
import { rideController } from "../ride/ride.controller";
import { rideReviewController } from "../ride-review/ride-review.controller";
import { driverEarningController } from "../driver-earning/driver-earning.controller";
import { driverDocumentController } from "../driver-document/driver-document.controller";
import { driverSafetyController } from "../driver-safety/driver-safety.controller";

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
adminRouter.get("/driver-documents", driverDocumentController.adminList);
adminRouter.patch(
  "/driver-documents/:documentId",
  driverDocumentController.review,
);
adminRouter.get("/driver-incidents", driverSafetyController.adminList);
adminRouter.patch(
  "/driver-incidents/:incidentId",
  driverSafetyController.review,
);
adminRouter.post("/drivers/:driverId/risk", driverSafetyController.risk);
adminRouter.patch("/support/tickets/:ticketId", supportController.updateTicket);
adminRouter.get("/rides", rideController.adminRides);
adminRouter.get("/drivers", rideController.drivers);
adminRouter.post("/drivers", rideController.createDriver);
adminRouter.patch("/drivers/:driverId", rideController.updateDriver);
adminRouter.post("/rides/:rideId/assign", rideController.assignDriver);
adminRouter.patch("/rides/:rideId/status", rideController.updateStatus);
adminRouter.patch("/rides/:rideId/charges", rideController.adjustRideCharges);
adminRouter.get("/ride-reviews", rideReviewController.adminReviews);
adminRouter.patch("/ride-reviews/:reviewId", rideReviewController.moderate);
adminRouter.get("/driver-balances", driverEarningController.balances);
adminRouter.get("/driver-payouts", driverEarningController.adminPayouts);
adminRouter.post("/driver-payouts", driverEarningController.createPayout);
adminRouter.patch(
  "/driver-payouts/:payoutId",
  driverEarningController.updatePayout,
);
adminRouter.post(
  "/driver-earnings/:earningId/adjustments",
  driverEarningController.addAdjustment,
);
