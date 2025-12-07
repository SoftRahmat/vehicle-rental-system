import { pool } from "../../config/db";

const ALLOWED_VEHICLE_TYPES = ["car", "bike", "van", "SUV"] as const;
type VehicleType = (typeof ALLOWED_VEHICLE_TYPES)[number];

/**
 * Vehicle shape
 */
export type Vehicle = {
  id: number;
  vehicle_name: string;
  type: VehicleType;
  registration_number: string;
  daily_rent_price: number;
  availability_status: "available" | "booked" | string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Create a vehicle (admin)
 */
const createVehicle = async (input: {
  vehicle_name: string;
  type: string;
  registration_number: string;
  daily_rent_price: number;
  availability_status?: string;
}): Promise<Vehicle> => {
  const { vehicle_name, type, registration_number, daily_rent_price } = input;
  const availability_status = input.availability_status ?? "available";

  // Basic validation
  if (!vehicle_name || !type || !registration_number || daily_rent_price == null) {
    const e: any = new Error("Missing required fields");
    e.status = 400;
    throw e;
  }

  // Validate allowed vehicle types
  if (!ALLOWED_VEHICLE_TYPES.includes(type as VehicleType)) {
    const e: any = new Error(
      `Invalid vehicle type. Allowed types are: ${ALLOWED_VEHICLE_TYPES.join(", ")}`
    );
    e.status = 400;
    throw e;
  }

  if (daily_rent_price <= 0) {
    const e: any = new Error("daily_rent_price must be positive");
    e.status = 400;
    throw e;
  }

  const sql = `
    INSERT INTO vehicles
      (vehicle_name, type, registration_number, daily_rent_price, availability_status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, vehicle_name, type, registration_number, daily_rent_price, availability_status, created_at, updated_at
  `;
  const params = [vehicle_name, type, registration_number, daily_rent_price, availability_status];

  try {
    const r = await pool.query(sql, params);
    return r.rows[0] as Vehicle;
  } catch (err: any) {
    // Unique violation on registration_number
    if (err?.code === "23505") {
      const e: any = new Error("Registration number already exists");
      e.status = 400;
      throw e;
    }
    const e: any = new Error("Failed to create vehicle");
    e.status = 500;
    e.errors = err?.message;
    throw e;
  }
};

/**
 * Get all vehicles (public)
 */
const getAllVehicles = async (): Promise<Vehicle[]> => {
  const r = await pool.query(
    `SELECT id, vehicle_name, type, registration_number, daily_rent_price, availability_status, created_at, updated_at
     FROM vehicles ORDER BY id`
  );
  return r.rows as Vehicle[];
};

/**
 * Get vehicle by id
 */
const getVehicleById = async (vehicleId: number): Promise<Vehicle> => {
  const r = await pool.query(
    `SELECT id, vehicle_name, type, registration_number, daily_rent_price, availability_status, created_at, updated_at
     FROM vehicles WHERE id = $1`,
    [vehicleId]
  );
  if (r.rowCount === 0) {
    const e: any = new Error("Vehicle not found");
    e.status = 404;
    throw e;
  }
  return r.rows[0] as Vehicle;
};

/**
 * Update vehicle (admin)
 */
const updateVehicle = async (
  vehicleId: number,
  payload: Partial<{
    vehicle_name: string;
    type: string;
    registration_number: string;
    daily_rent_price: number;
    availability_status: string;
  }>
): Promise<Vehicle> => {
  const allowedKeys = ["vehicle_name", "type", "registration_number", "daily_rent_price", "availability_status"] as const;
  type AllowedKey = typeof allowedKeys[number];

  const updates: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  for (const key of allowedKeys) {
    const value = payload[key as AllowedKey];
    if (value !== undefined) {
      // if updating numeric, don't wrap with LOWER
      if (key === "registration_number" || key === "vehicle_name" || key === "type" || key === "availability_status") {
        updates.push(`${key} = $${idx}`);
      } else {
        updates.push(`${key} = $${idx}`);
      }
      vals.push(value);
      idx++;
    }
  }

  if (updates.length === 0) {
    // return current row
    const cur = await pool.query(
      `SELECT id, vehicle_name, type, registration_number, daily_rent_price, availability_status, created_at, updated_at
       FROM vehicles WHERE id = $1`,
      [vehicleId]
    );
    if (cur.rowCount === 0) {
      const e: any = new Error("Vehicle not found");
      e.status = 404;
      throw e;
    }
    return cur.rows[0] as Vehicle;
  }

  const sql = `
    UPDATE vehicles
    SET ${updates.join(", ")}, updated_at = NOW()
    WHERE id = $${idx}
    RETURNING id, vehicle_name, type, registration_number, daily_rent_price, availability_status, created_at, updated_at
  `;
  vals.push(vehicleId);

  try {
    const r = await pool.query(sql, vals);
    if (r.rowCount === 0) {
      const e: any = new Error("Vehicle not found");
      e.status = 404;
      throw e;
    }
    return r.rows[0] as Vehicle;
  } catch (err: any) {
    // Unique constraint violation on registration_number
    if (err?.code === "23505") {
      const e: any = new Error("Registration number already exists");
      e.status = 400;
      throw e;
    }
    const e: any = new Error("Failed to update vehicle");
    e.status = 500;
    e.errors = err?.message;
    throw e;
  }
};

/**
 * Delete vehicle (admin)
 * - Only if there are no active bookings for this vehicle
 */
const deleteVehicle = async (vehicleId: number): Promise<void> => {
  try {
    // ensure exists
    const v = await pool.query(`SELECT id FROM vehicles WHERE id = $1`, [vehicleId]);
    if (v.rowCount === 0) {
      const e: any = new Error("Vehicle not found");
      e.status = 404;
      throw e;
    }

    // check active bookings
    const bookingRes = await pool.query(
      `SELECT count(*) AS cnt FROM bookings WHERE vehicle_id = $1 AND status = 'active'`,
      [vehicleId]
    );
    const cnt = Number(bookingRes.rows[0]?.cnt ?? 0);
    if (cnt > 0) {
      const e: any = new Error("Cannot delete vehicle with active bookings");
      e.status = 400;
      throw e;
    }

    await pool.query(`DELETE FROM vehicles WHERE id = $1`, [vehicleId]);
  } catch (err: any) {
    // If this is an expected app error (we set .status earlier), re-throw it unmodified
    if (err && typeof err.status === "number") {
      throw err;
    }

    // Otherwise wrap unknown errors so the caller receives a 500
    const e: any = new Error("Failed to delete vehicle");
    e.status = 500;
    e.errors = err?.message ?? String(err);
    throw e;
  }
};

export const vehicleService = {
  createVehicle,
  getAllVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle
}
