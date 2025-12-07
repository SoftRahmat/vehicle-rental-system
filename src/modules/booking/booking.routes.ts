import { Router } from "express";
import { bookingController } from "./booking.controller";
import { authGate } from "../../middleware/auth";

export const bookingRouter = Router();

/**
 * Create booking (Customer or Admin)
 */
bookingRouter.post("/", authGate.requireAuth, bookingController.createBooking);

/**
 * Get bookings (Admin sees all, Customer sees own)
 */
bookingRouter.get("/", authGate.requireAuth, bookingController.getBookings);

/**
 * Update booking status (PUT /api/v1/bookings/:bookingId)
 * - Customer: cancel (status = "cancelled") BEFORE start date only
 * - Admin: mark returned (status = "returned")
 */
bookingRouter.put("/:bookingId", authGate.requireAuth, bookingController.updateBooking);
