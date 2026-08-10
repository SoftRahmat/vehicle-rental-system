import { Router } from "express";
import { authGate } from "../../middleware/auth";
import { adminController } from "./admin.controller";

export const adminRouter = Router();

adminRouter.use(authGate.requireAuth, authGate.requireRole("admin"));
adminRouter.get("/dashboard/stats", adminController.getDashboardStats);
adminRouter.get("/vehicles", adminController.getVehicles);
adminRouter.get("/bookings", adminController.getBookings);
adminRouter.get("/users", adminController.getUsers);
