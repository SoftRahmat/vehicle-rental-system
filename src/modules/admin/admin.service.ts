import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";

type QueryInput = Record<string, unknown>;
type SortOrder = "asc" | "desc";

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type PageOptions = {
  page: number;
  pageSize: number;
  search: string;
  sortOrder: SortOrder;
};

const queryText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const positiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const pageOptions = (query: QueryInput): PageOptions => ({
  page: positiveInteger(query.page, 1),
  pageSize: Math.min(positiveInteger(query.pageSize, 15), 100),
  search: queryText(query.search).slice(0, 100),
  sortOrder:
    queryText(query.sortOrder).toLowerCase() === "asc" ? "asc" : "desc",
});

const resultPage = <T>(
  items: T[],
  total: number,
  options: PageOptions,
): PageResult<T> => ({
  items,
  page: options.page,
  pageSize: options.pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / options.pageSize),
});

const getVehicles = async (
  query: QueryInput,
): Promise<PageResult<Record<string, unknown>>> => {
  const options = pageOptions(query);
  const type = queryText(query.type);
  const status = queryText(query.status);
  const where: Prisma.VehicleWhereInput = {
    ...(options.search
      ? {
          OR: [
            { vehicleName: { contains: options.search, mode: "insensitive" } },
            {
              registrationNumber: {
                contains: options.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
    ...(type ? { type } : {}),
    ...(status ? { availabilityStatus: status } : {}),
  };
  const sortFields: Record<
    string,
    keyof Prisma.VehicleOrderByWithRelationInput
  > = {
    id: "id",
    vehicle_name: "vehicleName",
    type: "type",
    registration_number: "registrationNumber",
    daily_rent_price: "dailyRentPrice",
    availability_status: "availabilityStatus",
    created_at: "createdAt",
  };
  const sortField = sortFields[queryText(query.sortBy)] ?? "createdAt";
  const [records, total] = await prisma.$transaction([
    prisma.vehicle.findMany({
      where,
      orderBy: [{ [sortField]: options.sortOrder }, { id: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.vehicle.count({ where }),
  ]);
  const items = records.map((vehicle) => ({
    id: vehicle.id,
    vehicle_name: vehicle.vehicleName,
    type: vehicle.type,
    registration_number: vehicle.registrationNumber,
    daily_rent_price: Number(vehicle.dailyRentPrice),
    availability_status: vehicle.availabilityStatus,
    image_url: vehicle.imageUrl,
    created_at: vehicle.createdAt,
    updated_at: vehicle.updatedAt,
  }));
  return resultPage(items, total, options);
};

const getBookings = async (
  query: QueryInput,
): Promise<PageResult<Record<string, unknown>>> => {
  const options = pageOptions(query);
  const status = queryText(query.status);
  const where: Prisma.BookingWhereInput = {
    ...(options.search
      ? {
          OR: [
            {
              customer: {
                name: { contains: options.search, mode: "insensitive" },
              },
            },
            {
              customer: {
                email: { contains: options.search, mode: "insensitive" },
              },
            },
            {
              vehicle: {
                vehicleName: { contains: options.search, mode: "insensitive" },
              },
            },
            {
              vehicle: {
                registrationNumber: {
                  contains: options.search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
  };
  const sortFields: Record<
    string,
    keyof Prisma.BookingOrderByWithRelationInput
  > = {
    id: "id",
    rent_start_date: "rentStartDate",
    rent_end_date: "rentEndDate",
    total_price: "totalPrice",
    status: "status",
    created_at: "createdAt",
  };
  const requestedSort = queryText(query.sortBy);
  let orderBy: Prisma.BookingOrderByWithRelationInput;
  if (requestedSort === "customer") {
    orderBy = { customer: { name: options.sortOrder } };
  } else if (requestedSort === "vehicle") {
    orderBy = { vehicle: { vehicleName: options.sortOrder } };
  } else {
    const field = sortFields[requestedSort] ?? "createdAt";
    orderBy = { [field]: options.sortOrder };
  }
  const [records, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: {
        customer: { select: { name: true, email: true } },
        vehicle: {
          select: { vehicleName: true, registrationNumber: true, type: true },
        },
      },
      orderBy: [orderBy, { id: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.booking.count({ where }),
  ]);
  const items = records.map((booking) => ({
    id: booking.id,
    customer_id: booking.customerId,
    vehicle_id: booking.vehicleId,
    rent_start_date: booking.rentStartDate.toISOString().slice(0, 10),
    rent_end_date: booking.rentEndDate.toISOString().slice(0, 10),
    total_price: Number(booking.totalPrice),
    status: booking.status,
    created_at: booking.createdAt,
    updated_at: booking.updatedAt,
    customer: booking.customer
      ? { name: booking.customer.name, email: booking.customer.email }
      : null,
    vehicle: booking.vehicle
      ? {
          vehicle_name: booking.vehicle.vehicleName,
          registration_number: booking.vehicle.registrationNumber,
          type: booking.vehicle.type,
        }
      : null,
  }));
  return resultPage(items, total, options);
};

const getUsers = async (
  query: QueryInput,
): Promise<PageResult<Record<string, unknown>>> => {
  const options = pageOptions(query);
  const role = queryText(query.role);
  const where: Prisma.UserWhereInput = {
    ...(options.search
      ? {
          OR: [
            { name: { contains: options.search, mode: "insensitive" } },
            { email: { contains: options.search, mode: "insensitive" } },
            { phone: { contains: options.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(role ? { role } : {}),
  };
  const sortFields: Record<string, keyof Prisma.UserOrderByWithRelationInput> =
    {
      id: "id",
      name: "name",
      email: "email",
      role: "role",
      created_at: "createdAt",
    };
  const sortField = sortFields[queryText(query.sortBy)] ?? "createdAt";
  const [records, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ [sortField]: options.sortOrder }, { id: "desc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  const items = records.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }));
  return resultPage(items, total, options);
};

const getDashboardStats = async (): Promise<Record<string, number>> => {
  const [vehicles, available, activeBookings, customers] =
    await prisma.$transaction([
      prisma.vehicle.count(),
      prisma.vehicle.count({ where: { availabilityStatus: "available" } }),
      prisma.booking.count({ where: { status: "active" } }),
      prisma.user.count({ where: { role: "customer" } }),
    ]);
  return { vehicles, available, activeBookings, customers };
};

export const adminService = {
  getVehicles,
  getBookings,
  getUsers,
  getDashboardStats,
};
