import {
  differenceInCalendarDays,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { notificationService } from "../notification/notification.service";
import { currencyService } from "../currency/currency.service";
import {
  calculatePricing,
  normalizeRentalSelection,
  type RentalSelection,
} from "./pricing";

type Booking = {
  id: number;
  customer_id: number | null;
  vehicle_id: number | null;
  rent_start_date: string;
  rent_end_date: string;
  total_price: number;
  transaction_currency: string;
  display_currency: string;
  exchange_rate: number;
  display_total: number;
  exchange_rate_source: string;
  exchange_rate_captured_at: Date;
  pickup_location?: string | null;
  return_location?: string | null;
  pickup_time?: string | null;
  return_time?: string | null;
  insurance_plan?: string | null;
  add_ons?: string[];
  special_requests?: string | null;
  base_price?: number | null;
  insurance_fee?: number | null;
  add_ons_fee?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  deposit_amount?: number | null;
  promo_code?: string | null;
  payment_status?: string | null;
  status: string;
  created_at?: Date | null;
  updated_at?: Date | null;
  vehicle?: Record<string, unknown>;
  customer?: { name: string; email: string } | null;
};

type Actor = { id: number; role: "admin" | "customer" | "driver" };

const bookingInclude = {
  vehicle: {
    select: {
      vehicleName: true,
      registrationNumber: true,
      dailyRentPrice: true,
      type: true,
      availabilityStatus: true,
    },
  },
  customer: { select: { name: true, email: true } },
} as const satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

const appError = (
  message: string,
  status: number,
): Error & { status: number } => Object.assign(new Error(message), { status });

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

const timeOnly = (date: Date | null): string | null =>
  date ? date.toISOString().slice(11, 16) : null;

const timeValue = (time: string): Date =>
  new Date(`1970-01-01T${time.length === 5 ? `${time}:00` : time}.000Z`);

const decimal = (value: Prisma.Decimal | null): number | null =>
  value == null ? null : Number(value);

const money = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toBooking = (record: BookingRecord): Booking => ({
  id: record.id,
  customer_id: record.customerId,
  vehicle_id: record.vehicleId,
  rent_start_date: dateOnly(record.rentStartDate),
  rent_end_date: dateOnly(record.rentEndDate),
  total_price: Number(record.totalPrice),
  transaction_currency: record.transactionCurrency,
  display_currency: record.displayCurrency,
  exchange_rate: Number(record.exchangeRate),
  display_total: Number(record.displayTotal),
  exchange_rate_source: record.exchangeRateSource,
  exchange_rate_captured_at: record.exchangeRateCapturedAt,
  pickup_location: record.pickupLocation,
  return_location: record.returnLocation,
  pickup_time: timeOnly(record.pickupTime),
  return_time: timeOnly(record.returnTime),
  insurance_plan: record.insurancePlan,
  add_ons: Array.isArray(record.addOns)
    ? record.addOns.filter((item): item is string => typeof item === "string")
    : [],
  special_requests: record.specialRequests,
  base_price: decimal(record.basePrice),
  insurance_fee: decimal(record.insuranceFee),
  add_ons_fee: decimal(record.addOnsFee),
  discount_amount: decimal(record.discountAmount),
  tax_amount: decimal(record.taxAmount),
  deposit_amount: decimal(record.depositAmount),
  promo_code: record.promoCode,
  payment_status: record.paymentStatus,
  status: record.status,
  created_at: record.createdAt,
  updated_at: record.updatedAt,
  customer: record.customer,
  ...(record.vehicle
    ? {
        vehicle: {
          vehicle_name: record.vehicle.vehicleName,
          registration_number: record.vehicle.registrationNumber,
          daily_rent_price: Number(record.vehicle.dailyRentPrice),
          type: record.vehicle.type,
          availability_status: record.vehicle.availabilityStatus,
        },
      }
    : {}),
});

const calcDaysInclusive = (startIso: string, endIso: string): number =>
  differenceInCalendarDays(parseISO(endIso), parseISO(startIso)) + 1;

const createBooking = async (
  payload: {
    customer_id?: number;
    vehicle_id: number;
    rent_start_date: string;
    rent_end_date: string;
    display_currency?: string;
  } & RentalSelection,
  actor?: Actor,
): Promise<Booking> => {
  if (
    !payload?.vehicle_id ||
    !payload.rent_start_date ||
    !payload.rent_end_date
  ) {
    throw appError("Missing required fields", 400);
  }

  let customerId = payload.customer_id;
  if (!customerId) {
    if (!actor) throw appError("Unauthorized", 401);
    if (actor.role === "customer") customerId = actor.id;
  } else if (actor?.role === "customer" && actor.id !== customerId) {
    throw appError("Forbidden", 403);
  }

  const start = parseISO(payload.rent_start_date);
  const end = parseISO(payload.rent_end_date);
  if (!isValid(start) || !isValid(end)) {
    throw appError("Invalid date format; use ISO YYYY-MM-DD", 400);
  }
  if (end < start) {
    throw appError(
      "rent_end_date must be after or equal to rent_start_date",
      400,
    );
  }
  if (isBefore(start, startOfDay(new Date()))) {
    throw appError("rent_start_date cannot be in the past", 400);
  }

  const days = calcDaysInclusive(
    payload.rent_start_date,
    payload.rent_end_date,
  );
  if (days <= 0) throw appError("Invalid date range", 400);
  const selection = normalizeRentalSelection(payload);
  const currencySnapshot = await currencyService.transactionSnapshot(
    1,
    "USD",
    payload.display_currency,
  );
  if (
    payload.rent_start_date === payload.rent_end_date &&
    selection.returnTime <= selection.pickupTime
  ) {
    throw appError(
      "Return time must be after pickup time for a same-day rental",
      400,
    );
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${payload.vehicle_id} FOR UPDATE`;
        const vehicle = await tx.vehicle.findUnique({
          where: { id: payload.vehicle_id },
          select: { id: true, vehicleName: true, dailyRentPrice: true },
        });
        if (!vehicle) throw appError("Vehicle not found", 404);

        const overlapCount = await tx.booking.count({
          where: {
            vehicleId: payload.vehicle_id,
            status: "active",
            rentEndDate: { gte: start },
            rentStartDate: { lte: end },
          },
        });
        if (overlapCount > 0) {
          throw appError(
            "Vehicle is not available for the selected dates",
            400,
          );
        }

        const pricing = calculatePricing(
          Number(vehicle.dailyRentPrice),
          days,
          selection,
        );
        const booking = await tx.booking.create({
          data: {
            customerId: customerId ?? null,
            vehicleId: payload.vehicle_id,
            rentStartDate: start,
            rentEndDate: end,
            totalPrice: pricing.totalPrice,
            transactionCurrency: currencySnapshot.transactionCurrency,
            displayCurrency: currencySnapshot.displayCurrency,
            exchangeRate: currencySnapshot.exchangeRate,
            displayTotal: money(pricing.totalPrice * currencySnapshot.exchangeRate),
            exchangeRateSource: currencySnapshot.exchangeRateSource,
            exchangeRateCapturedAt: currencySnapshot.exchangeRateCapturedAt,
            status: "active",
            pickupLocation: selection.pickupLocation,
            returnLocation: selection.returnLocation,
            pickupTime: timeValue(selection.pickupTime),
            returnTime: timeValue(selection.returnTime),
            insurancePlan: selection.insurancePlan,
            addOns: selection.addOns,
            specialRequests: selection.specialRequests,
            basePrice: pricing.basePrice,
            insuranceFee: pricing.insuranceFee,
            addOnsFee: pricing.addOnsFee,
            discountAmount: pricing.discountAmount,
            taxAmount: pricing.taxAmount,
            depositAmount: pricing.depositAmount,
            promoCode: selection.promoCode,
            paymentStatus: "pending",
          },
          include: bookingInclude,
        });
        await tx.vehicle.update({
          where: { id: payload.vehicle_id },
          data: { availabilityStatus: "booked", updatedAt: new Date() },
        });
        return { booking, pricing, vehicle };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const booking = toBooking(result.booking);
    if (customerId) {
      void notificationService
        .sendBookingConfirmation({
          bookingId: booking.id,
          customerId,
          vehicleName: result.vehicle.vehicleName,
          startDate: payload.rent_start_date,
          endDate: payload.rent_end_date,
          totalPrice: result.pricing.totalPrice,
          transactionCurrency: currencySnapshot.transactionCurrency,
          displayTotal: money(
            result.pricing.totalPrice * currencySnapshot.exchangeRate,
          ),
          displayCurrency: currencySnapshot.displayCurrency,
        })
        .catch((error) => console.error("Booking notification failed", error));
    }
    return booking;
  } catch (error: unknown) {
    if (error instanceof Error && "status" in error) throw error;
    const wrapped = appError(
      error instanceof Error ? error.message : "Failed to create booking",
      500,
    ) as Error & { errors?: string };
    if (error instanceof Error) wrapped.errors = error.message;
    throw wrapped;
  }
};

const getBookings = async (actor?: Actor): Promise<Booking[]> => {
  if (!actor) throw appError("Unauthorized", 401);
  const records = await prisma.booking.findMany({
    ...(actor.role === "customer" ? { where: { customerId: actor.id } } : {}),
    include: bookingInclude,
    orderBy: { id: "desc" },
  });
  return records.map(toBooking);
};

const updateBooking = async (
  bookingId: number,
  status: string,
  actor?: Actor,
): Promise<Booking> => {
  if (!actor) throw appError("Unauthorized", 401);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw appError("Booking not found", 404);

  if (status === "cancelled") {
    if (actor.role === "customer" && actor.id !== booking.customerId) {
      throw appError("Forbidden", 403);
    }
    if (new Date() >= booking.rentStartDate) {
      throw appError("Cancellation allowed only before start date", 400);
    }
  } else if (status === "returned") {
    if (actor.role !== "admin") throw appError("Forbidden", 403);
  } else {
    throw appError("Unsupported status update", 400);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (booking.vehicleId) {
        await tx.vehicle.update({
          where: { id: booking.vehicleId },
          data: { availabilityStatus: "available", updatedAt: new Date() },
        });
      }
      return tx.booking.update({
        where: { id: bookingId },
        data: { status, updatedAt: new Date() },
        include: bookingInclude,
      });
    });
    return toBooking(updated);
  } catch (error: unknown) {
    const message =
      status === "cancelled"
        ? "Failed to cancel booking"
        : "Failed to mark returned";
    const wrapped = appError(message, 500) as Error & { errors?: string };
    if (error instanceof Error) wrapped.errors = error.message;
    throw wrapped;
  }
};

export const bookingService = { createBooking, getBookings, updateBooking };
