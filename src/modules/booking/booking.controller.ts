import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { bookingService } from "./booking.service";
import type { AuthUser } from "../../types/express/index";

/**
 * POST /api/v1/bookings
 * Body: { customer_id, vehicle_id, rent_start_date, rent_end_date }
 */
const createBooking = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user as AuthUser | undefined;
  const payload = req.body;

  // allow admin to create for any customer, customers create for themselves only
  if (!payload) {
    return res.status(400).json({ success: false, message: "Bad Request: body required" });
  }

  try {
    const booking = await bookingService.createBooking(payload, actor);
    return res.status(201).json({ success: true, message: "Booking created successfully", data: booking });
  } catch (err: any) {
    // service throws with .status where applicable
    const status = err?.status ?? 500;
    return res.status(status).json({
      success: false,
      message: err?.message ?? "Failed to create booking",
      errors: err?.errors ?? null,
    });
  }
});

/**
 * GET /api/v1/bookings
 */
const getBookings = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user as AuthUser | undefined;
  const bookings = await bookingService.getBookings(actor);
  const msg = actor && actor.role === "admin" ? "Bookings retrieved successfully" : "Your bookings retrieved successfully";
  res.status(200).json({ success: true, message: msg, data: bookings });
});

/**
 * PUT /api/v1/bookings/:bookingId
 * Body: { status: "cancelled" } OR { status: "returned" }
 */
const updateBooking = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user as AuthUser | undefined;
  const { bookingId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: "Bad Request: status required" });
  }

  const updated = await bookingService.updateBooking(Number(bookingId), status, actor);
  // status can be cancelled or returned — map messages accordingly
  const message =
    status === "cancelled"
      ? "Booking cancelled successfully"
      : status === "returned"
      ? "Booking marked as returned. Vehicle is now available"
      : "Booking updated";

  res.status(200).json({ success: true, message, data: updated });
});

export const bookingController = {
  createBooking,
  getBookings,
  updateBooking
}
