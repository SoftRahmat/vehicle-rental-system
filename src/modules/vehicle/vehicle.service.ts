import {
  differenceInCalendarDays,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns";
import { Prisma } from "../../generated/prisma/client";
import { getAvailableAlternatives } from "../../generated/prisma/sql/getAvailableAlternatives";
import { getFleet } from "../../generated/prisma/sql/getFleet";
import { getUnavailableRanges as unavailableRangesQuery } from "../../generated/prisma/sql/getUnavailableRanges";
import { prisma } from "../../lib/prisma";
import {
  calculatePricing,
  normalizeRentalSelection,
  type NormalizedRentalSelection,
  type PricingBreakdown,
  type RentalSelection,
} from "../booking/pricing";

const ALLOWED_VEHICLE_TYPES = ["car", "bike", "van", "SUV"] as const;
type VehicleType = (typeof ALLOWED_VEHICLE_TYPES)[number];

export type Vehicle = {
  id: number;
  vehicle_name: string;
  type: VehicleType;
  registration_number: string;
  daily_rent_price: number;
  availability_status: string;
  image_url?: string | null;
  seats?: number | null;
  transmission?: string | null;
  fuel_type?: string | null;
  location?: string | null;
  rating?: number | null;
  description?: string | null;
  available_for_period?: boolean;
  next_available_date?: string | null;
  created_at?: Date | null;
  updated_at?: Date | null;
};

const vehicleSelect = {
  id: true,
  vehicleName: true,
  type: true,
  registrationNumber: true,
  dailyRentPrice: true,
  availabilityStatus: true,
  imageUrl: true,
  seats: true,
  transmission: true,
  fuelType: true,
  location: true,
  rating: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.VehicleSelect;

type SelectedVehicle = Prisma.VehicleGetPayload<{
  select: typeof vehicleSelect;
}>;

const toVehicle = (vehicle: SelectedVehicle): Vehicle => ({
  id: vehicle.id,
  vehicle_name: vehicle.vehicleName,
  type: vehicle.type as VehicleType,
  registration_number: vehicle.registrationNumber,
  daily_rent_price: Number(vehicle.dailyRentPrice),
  availability_status: vehicle.availabilityStatus,
  image_url: vehicle.imageUrl,
  seats: vehicle.seats,
  transmission: vehicle.transmission,
  fuel_type: vehicle.fuelType,
  location: vehicle.location,
  rating: vehicle.rating == null ? null : Number(vehicle.rating),
  description: vehicle.description,
  created_at: vehicle.createdAt,
  updated_at: vehicle.updatedAt,
});

const rowToVehicle = (
  row: getFleet.Result | getAvailableAlternatives.Result,
): Vehicle => ({
  id: row.id,
  vehicle_name: row.vehicle_name,
  type: row.type as VehicleType,
  registration_number: row.registration_number,
  daily_rent_price: Number(row.daily_rent_price),
  availability_status: row.availability_status,
  image_url: row.image_url,
  seats: row.seats,
  transmission: row.transmission,
  fuel_type: row.fuel_type,
  location: row.location,
  rating: row.rating == null ? null : Number(row.rating),
  description: row.description,
  created_at: row.created_at,
  updated_at: row.updated_at,
  ...(Object.hasOwn(row, "available_for_period")
    ? {
        available_for_period: Boolean(
          (row as getFleet.Result).available_for_period,
        ),
        next_available_date: (row as getFleet.Result).next_available_date,
      }
    : {}),
});

const appError = (
  message: string,
  status: number,
): Error & { status: number } => Object.assign(new Error(message), { status });

const validateVehicleInput = (input: {
  vehicle_name?: string;
  type?: string;
  daily_rent_price?: number;
  seats?: number | null;
  rating?: number | null;
}): void => {
  if (
    input.type &&
    !ALLOWED_VEHICLE_TYPES.includes(input.type as VehicleType)
  ) {
    throw appError(
      `Invalid vehicle type. Allowed types are: ${ALLOWED_VEHICLE_TYPES.join(", ")}`,
      400,
    );
  }
  if (
    input.daily_rent_price !== undefined &&
    Number(input.daily_rent_price) <= 0
  ) {
    throw appError("Daily rent price must be positive", 400);
  }
  if (
    input.seats != null &&
    (!Number.isInteger(Number(input.seats)) || Number(input.seats) < 1)
  ) {
    throw appError("Seats must be a positive whole number", 400);
  }
  if (
    input.rating != null &&
    (Number(input.rating) < 0 || Number(input.rating) > 5)
  ) {
    throw appError("Rating must be between 0 and 5", 400);
  }
  const name = input.vehicle_name?.trim().toLowerCase() ?? "";
  const carModels = ["camry", "civic", "corolla", "sedan"];
  const bikeModels = ["motorcycle", "motorbike", "scooter"];
  if (
    input.type === "bike" &&
    carModels.some((model) => name.includes(model))
  ) {
    throw appError("Vehicle name does not match the selected bike type", 400);
  }
  if (
    input.type &&
    input.type !== "bike" &&
    bikeModels.some((model) => name.includes(model))
  ) {
    throw appError(
      "Vehicle name does not match the selected vehicle type",
      400,
    );
  }
};

export type VehicleAvailabilityQuote = {
  vehicleId: number;
  available: boolean;
  days: number;
  dailyRate: number;
  totalPrice: number;
  alternatives: Vehicle[];
  pricing: PricingBreakdown;
  selection: NormalizedRentalSelection;
};

export type VehicleUnavailableRange = { startDate: string; endDate: string };

const getUnavailableRanges = async (
  vehicleId: number,
): Promise<VehicleUnavailableRange[]> => {
  await getVehicleById(vehicleId);
  const rows = await prisma.$queryRawTyped(unavailableRangesQuery(vehicleId));
  return rows.map((row) => ({
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
  }));
};

const getAvailabilityQuote = async (
  vehicleId: number,
  startDate: string,
  endDate: string,
  rentalSelection: RentalSelection = {},
): Promise<VehicleAvailabilityQuote> => {
  if (!Number.isInteger(vehicleId) || vehicleId <= 0)
    throw appError("Invalid vehicle id", 400);
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (!startDate || !endDate || !isValid(start) || !isValid(end)) {
    throw appError("Valid startDate and endDate are required", 400);
  }
  if (isBefore(start, startOfDay(new Date())))
    throw appError("Start date cannot be in the past", 400);
  if (isBefore(end, start))
    throw appError("End date must be after or equal to start date", 400);

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { dailyRentPrice: true },
  });
  if (!vehicle) throw appError("Vehicle not found", 404);
  const overlapCount = await prisma.booking.count({
    where: {
      vehicleId,
      status: "active",
      rentEndDate: { gte: start },
      rentStartDate: { lte: end },
    },
  });
  const days = differenceInCalendarDays(end, start) + 1;
  const dailyRate = Number(vehicle.dailyRentPrice);
  const selection = normalizeRentalSelection(rentalSelection);
  if (startDate === endDate && selection.returnTime <= selection.pickupTime) {
    throw appError(
      "Return time must be after pickup time for a same-day rental",
      400,
    );
  }
  const pricing = calculatePricing(dailyRate, days, selection);
  const alternativeRows = await prisma.$queryRawTyped(
    getAvailableAlternatives(vehicleId, start, end, dailyRate),
  );
  return {
    vehicleId,
    available: overlapCount === 0,
    days,
    dailyRate,
    totalPrice: pricing.totalPrice,
    alternatives: alternativeRows.map(rowToVehicle),
    pricing,
    selection,
  };
};

type VehicleInput = {
  vehicle_name: string;
  type: string;
  registration_number: string;
  daily_rent_price: number;
  availability_status?: string;
  image_url?: string;
  seats?: number;
  transmission?: string;
  fuel_type?: string;
  location?: string;
  rating?: number;
  description?: string;
};

const createVehicle = async (input: VehicleInput): Promise<Vehicle> => {
  if (
    !input.vehicle_name ||
    !input.type ||
    !input.registration_number ||
    input.daily_rent_price == null
  ) {
    throw appError("Missing required fields", 400);
  }
  validateVehicleInput(input);
  try {
    const created = await prisma.vehicle.create({
      data: {
        vehicleName: input.vehicle_name,
        type: input.type,
        registrationNumber: input.registration_number,
        dailyRentPrice: input.daily_rent_price,
        availabilityStatus: input.availability_status ?? "available",
        imageUrl: input.image_url?.trim() || null,
        seats: input.seats ?? null,
        transmission: input.transmission?.trim() || null,
        fuelType: input.fuel_type?.trim() || null,
        location: input.location?.trim() || "Downtown Hub",
        rating: input.rating ?? 5,
        description: input.description?.trim() || null,
      },
      select: vehicleSelect,
    });
    return toVehicle(created);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw appError("Registration number already exists", 400);
    }
    throw error;
  }
};

const getAllVehicles = async (
  startDate?: string,
  endDate?: string,
): Promise<Vehicle[]> => {
  const hasDateRange = Boolean(startDate && endDate);
  let start: Date | null = null;
  let end: Date | null = null;
  if (hasDateRange) {
    start = parseISO(startDate as string);
    end = parseISO(endDate as string);
    if (!isValid(start) || !isValid(end) || isBefore(end, start)) {
      throw appError("Provide a valid rental date range", 400);
    }
  }
  const rows = await prisma.$queryRawTyped(getFleet(start, end));
  return rows.map(rowToVehicle);
};

const getVehicleCatalog = async (query: Record<string, unknown>) => {
  const positiveInteger = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const stringValue = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(positiveInteger(query.pageSize, 12), 48);
  const search = stringValue(query.search).toLowerCase();
  const type = stringValue(query.type).toLowerCase();
  const availability = stringValue(query.availability);
  const sort = stringValue(query.sort) || "recommended";
  const startDate = stringValue(query.startDate) || undefined;
  const endDate = stringValue(query.endDate) || undefined;
  const isAvailable = (vehicle: Vehicle): boolean =>
    vehicle.available_for_period ?? vehicle.availability_status === "available";

  const fleet = await getAllVehicles(startDate, endDate);
  const matching = fleet.filter(
    (vehicle) =>
      (!search ||
        `${vehicle.vehicle_name} ${vehicle.registration_number} ${vehicle.type} ${vehicle.location ?? ""}`
          .toLowerCase()
          .includes(search)) &&
      (!type || vehicle.type.toLowerCase() === type) &&
      (!availability ||
        (availability === "available") === isAvailable(vehicle)),
  );
  matching.sort((left, right) => {
    if (sort === "price-asc")
      return left.daily_rent_price - right.daily_rent_price;
    if (sort === "price-desc")
      return right.daily_rent_price - left.daily_rent_price;
    if (sort === "name")
      return left.vehicle_name.localeCompare(right.vehicle_name);
    if (sort === "availability")
      return Number(isAvailable(right)) - Number(isAvailable(left));
    return (
      Number(isAvailable(right)) - Number(isAvailable(left)) ||
      Number(right.rating ?? 0) - Number(left.rating ?? 0) ||
      left.id - right.id
    );
  });

  const total = matching.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  return {
    items: matching.slice(offset, offset + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
    available: matching.filter(isAvailable).length,
  };
};

const getVehicleById = async (vehicleId: number): Promise<Vehicle> => {
  const record = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: vehicleSelect,
  });
  if (!record) throw appError("Vehicle not found", 404);
  return toVehicle(record);
};

const updateVehicle = async (
  vehicleId: number,
  payload: Partial<VehicleInput>,
): Promise<Vehicle> => {
  const current = await getVehicleById(vehicleId);
  validateVehicleInput({ ...current, ...payload });
  const data: Prisma.VehicleUpdateInput = { updatedAt: new Date() };
  if (payload.vehicle_name !== undefined)
    data.vehicleName = payload.vehicle_name;
  if (payload.type !== undefined) data.type = payload.type;
  if (payload.registration_number !== undefined)
    data.registrationNumber = payload.registration_number;
  if (payload.daily_rent_price !== undefined)
    data.dailyRentPrice = payload.daily_rent_price;
  if (payload.availability_status !== undefined)
    data.availabilityStatus = payload.availability_status;
  if (payload.image_url !== undefined)
    data.imageUrl = payload.image_url || null;
  if (payload.seats !== undefined) data.seats = payload.seats;
  if (payload.transmission !== undefined)
    data.transmission = payload.transmission || null;
  if (payload.fuel_type !== undefined)
    data.fuelType = payload.fuel_type || null;
  if (payload.location !== undefined) data.location = payload.location || null;
  if (payload.rating !== undefined) data.rating = payload.rating;
  if (payload.description !== undefined)
    data.description = payload.description || null;
  try {
    return toVehicle(
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data,
        select: vehicleSelect,
      }),
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw appError("Registration number already exists", 400);
    }
    throw error;
  }
};

const deleteVehicle = async (vehicleId: number): Promise<void> => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });
  if (!vehicle) throw appError("Vehicle not found", 404);
  const activeBookings = await prisma.booking.count({
    where: { vehicleId, status: "active" },
  });
  if (activeBookings > 0)
    throw appError("Cannot delete vehicle with active bookings", 400);
  await prisma.vehicle.delete({ where: { id: vehicleId } });
};

export const vehicleService = {
  createVehicle,
  getAllVehicles,
  getVehicleCatalog,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  getAvailabilityQuote,
  getUnavailableRanges,
};
