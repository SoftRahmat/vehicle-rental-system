import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { adminController } from "./admin.controller";
import { supportController } from "../support/support.controller";

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
