import { pool } from "../../config/db";

type QueryInput = Record<string, unknown>;
type SortOrder = "ASC" | "DESC";

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
    queryText(query.sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC",
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
  const values: unknown[] = [];
  const conditions: string[] = [];
  const parameter = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (options.search) {
    const search = parameter(`%${options.search}%`);
    conditions.push(
      `(vehicle_name ILIKE ${search} OR registration_number ILIKE ${search})`,
    );
  }
  const type = queryText(query.type);
  if (type) conditions.push(`type = ${parameter(type)}`);
  const status = queryText(query.status);
  if (status) conditions.push(`availability_status = ${parameter(status)}`);

  const sortColumns: Record<string, string> = {
    id: "id",
    vehicle_name: "vehicle_name",
    type: "type",
    registration_number: "registration_number",
    daily_rent_price: "daily_rent_price",
    availability_status: "availability_status",
    created_at: "created_at",
  };
  const sortBy = sortColumns[queryText(query.sortBy)] ?? "created_at";
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = parameter(options.pageSize);
  const offset = parameter((options.page - 1) * options.pageSize);
  const response = await pool.query(
    `SELECT id, vehicle_name, type, registration_number, daily_rent_price,
            availability_status, image_url, created_at, updated_at,
            COUNT(*) OVER() AS total_count
     FROM vehicles
     ${where}
     ORDER BY ${sortBy} ${options.sortOrder}, id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const total = Number(response.rows[0]?.total_count ?? 0);
  const items = response.rows.map(
    ({ total_count: _total, ...vehicle }) => vehicle,
  );
  return resultPage(items, total, options);
};

const getBookings = async (
  query: QueryInput,
): Promise<PageResult<Record<string, unknown>>> => {
  const options = pageOptions(query);
  const values: unknown[] = [];
  const conditions: string[] = [];
  const parameter = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (options.search) {
    const search = parameter(`%${options.search}%`);
    conditions.push(
      `(u.name ILIKE ${search} OR u.email ILIKE ${search} OR v.vehicle_name ILIKE ${search} OR v.registration_number ILIKE ${search})`,
    );
  }
  const status = queryText(query.status);
  if (status) conditions.push(`b.status = ${parameter(status)}`);

  const sortColumns: Record<string, string> = {
    id: "b.id",
    customer: "u.name",
    vehicle: "v.vehicle_name",
    rent_start_date: "b.rent_start_date",
    rent_end_date: "b.rent_end_date",
    total_price: "b.total_price",
    status: "b.status",
    created_at: "b.created_at",
  };
  const sortBy = sortColumns[queryText(query.sortBy)] ?? "b.created_at";
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = parameter(options.pageSize);
  const offset = parameter((options.page - 1) * options.pageSize);
  const response = await pool.query(
    `SELECT b.id, b.customer_id, b.vehicle_id, b.rent_start_date, b.rent_end_date,
            b.total_price, b.status, b.created_at, b.updated_at,
            u.name AS customer_name, u.email AS customer_email,
            v.vehicle_name, v.registration_number, v.type,
            COUNT(*) OVER() AS total_count
     FROM bookings b
     LEFT JOIN users u ON u.id = b.customer_id
     LEFT JOIN vehicles v ON v.id = b.vehicle_id
     ${where}
     ORDER BY ${sortBy} ${options.sortOrder}, b.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const total = Number(response.rows[0]?.total_count ?? 0);
  const items = response.rows.map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    vehicle_id: row.vehicle_id,
    rent_start_date: row.rent_start_date,
    rent_end_date: row.rent_end_date,
    total_price: row.total_price,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    customer: { name: row.customer_name, email: row.customer_email },
    vehicle: {
      vehicle_name: row.vehicle_name,
      registration_number: row.registration_number,
      type: row.type,
    },
  }));
  return resultPage(items, total, options);
};

const getUsers = async (
  query: QueryInput,
): Promise<PageResult<Record<string, unknown>>> => {
  const options = pageOptions(query);
  const values: unknown[] = [];
  const conditions: string[] = [];
  const parameter = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (options.search) {
    const search = parameter(`%${options.search}%`);
    conditions.push(
      `(name ILIKE ${search} OR email ILIKE ${search} OR phone ILIKE ${search})`,
    );
  }
  const role = queryText(query.role);
  if (role) conditions.push(`role = ${parameter(role)}`);

  const sortColumns: Record<string, string> = {
    id: "id",
    name: "name",
    email: "email",
    role: "role",
    created_at: "created_at",
  };
  const sortBy = sortColumns[queryText(query.sortBy)] ?? "created_at";
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = parameter(options.pageSize);
  const offset = parameter((options.page - 1) * options.pageSize);
  const response = await pool.query(
    `SELECT id, name, email, phone, role, created_at, updated_at,
            COUNT(*) OVER() AS total_count
     FROM users
     ${where}
     ORDER BY ${sortBy} ${options.sortOrder}, id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  const total = Number(response.rows[0]?.total_count ?? 0);
  const items = response.rows.map(({ total_count: _total, ...user }) => user);
  return resultPage(items, total, options);
};

const getDashboardStats = async (): Promise<Record<string, number>> => {
  const response = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM vehicles) AS vehicles,
      (SELECT COUNT(*) FROM vehicles WHERE availability_status = 'available') AS available,
      (SELECT COUNT(*) FROM bookings WHERE status = 'active') AS active_bookings,
      (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers
  `);
  const stats = response.rows[0];
  return {
    vehicles: Number(stats.vehicles),
    available: Number(stats.available),
    activeBookings: Number(stats.active_bookings),
    customers: Number(stats.customers),
  };
};

export const adminService = {
  getVehicles,
  getBookings,
  getUsers,
  getDashboardStats,
};
