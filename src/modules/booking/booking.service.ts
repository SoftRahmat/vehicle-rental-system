import { pool } from "../../config/db";
import { PoolClient } from "pg";
import { differenceInCalendarDays, parseISO, isValid } from "date-fns";

/**
 * Booking DB shape returned (simplified)
 */
type Booking = {
  id: number;
  customer_id: number;
  vehicle_id: number;
  rent_start_date: string;
  rent_end_date: string;
  total_price: string | number;
  status: string;
  created_at?: string;
  updated_at?: string;
  vehicle?: {
    vehicle_name: string;
    daily_rent_price?: number;
  };
  customer?: {
    name: string;
    email: string;
  };
};

type Actor = {
  id: number;
  role: "admin" | "customer";
};

/**
 * Utility: calculate days inclusive
 * e.g., start 2024-01-15, end 2024-01-20 => 6 days? We follow inclusive: (end - start) + 1
 * We'll use date-fns differenceInCalendarDays and add 1.
 */
const calcDaysInclusive = (startIso: string, endIso: string): number => {
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  const diff = differenceInCalendarDays(e, s);
  return diff + 1;
};

/**
 * Create booking with transaction:
 * - validate dates
 * - check vehicle exists and is available for requested period (no overlapping active bookings)
 * - calculate total_price = daily_rent_price * number_of_days (inclusive)
 * - insert booking (status = 'active')
 * - update vehicle availability_status = 'booked'
 */
const createBooking = async (
  payload: {
    customer_id?: number; // optional: if missing and actor is customer, use actor.id
    vehicle_id: number;
    rent_start_date: string;
    rent_end_date: string;
  },
  actor?: Actor | undefined
): Promise<Booking> => {
  // Basic validation
  if (!payload || !payload.vehicle_id || !payload.rent_start_date || !payload.rent_end_date) {
    const e: any = new Error("Missing required fields");
    e.status = 400;
    throw e;
  }

  // resolve customer id: if actor is customer and no customer_id provided, use actor.id
  let customerId = payload.customer_id;
  if (!customerId) {
    if (!actor) {
      const e: any = new Error("Unauthorized");
      e.status = 401;
      throw e;
    }
    // admin may specify customer_id; customer creates for self
    if (actor.role === "customer") customerId = actor.id;
  } else {
    // if provided but actor is customer ensure actor.id === customer_id
    if (actor && actor.role === "customer" && actor.id !== customerId) {
      const e: any = new Error("Forbidden");
      e.status = 403;
      throw e;
    }
  }

  // parse and validate dates
  const s = parseISO(payload.rent_start_date);
  const e = parseISO(payload.rent_end_date);
  if (!isValid(s) || !isValid(e)) {
    const err: any = new Error("Invalid date format; use ISO YYYY-MM-DD");
    err.status = 400;
    throw err;
  }
  if (e < s) {
    const err: any = new Error("rent_end_date must be after or equal to rent_start_date");
    err.status = 400;
    throw err;
  }

  // compute days inclusive
  const days = calcDaysInclusive(payload.rent_start_date, payload.rent_end_date);
  if (days <= 0) {
    const err: any = new Error("Invalid date range");
    err.status = 400;
    throw err;
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    // fetch vehicle and ensure it exists
    const vRes = await client.query(
      `SELECT id, vehicle_name, daily_rent_price, availability_status FROM vehicles WHERE id = $1 FOR UPDATE`,
      [payload.vehicle_id]
    );
    if (vRes.rowCount === 0) {
      const err: any = new Error("Vehicle not found");
      err.status = 404;
      throw err;
    }
    const vehicle = vRes.rows[0];

    // Check overlapping active bookings for same vehicle
    // Overlap condition: NOT (existing_end < new_start OR existing_start > new_end)
    const overlapRes = await client.query(
      `SELECT count(*) AS cnt FROM bookings
       WHERE vehicle_id = $1
         AND status = 'active'
         AND NOT (rent_end_date < $2 OR rent_start_date > $3)`,
      [payload.vehicle_id, payload.rent_start_date, payload.rent_end_date]
    );
    const overlapCount = Number(overlapRes.rows[0]?.cnt ?? 0);
    if (overlapCount > 0) {
      const err: any = new Error("Vehicle is not available for the selected dates");
      err.status = 400;
      throw err;
    }

    // calculate price: daily_rent_price * days
    // vehicle.daily_rent_price may be numeric/string depending on pg config
    const daily = Number(vehicle.daily_rent_price);
    const total_price = Number((daily * days).toFixed(2));

    // insert booking
    const insertRes = await client.query(
      `INSERT INTO bookings (customer_id, vehicle_id, rent_start_date, rent_end_date, total_price, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, customer_id, vehicle_id, rent_start_date, rent_end_date, total_price, status, created_at, updated_at`,
      [customerId, payload.vehicle_id, payload.rent_start_date, payload.rent_end_date, total_price]
    );
    const bookingInserted = insertRes.rows[0];

    // update vehicle availability to 'booked' (simple approach)
    await client.query(`UPDATE vehicles SET availability_status = 'booked', updated_at = NOW() WHERE id = $1`, [
      payload.vehicle_id,
    ]);

    await client.query("COMMIT");

    // assemble return shape with nested vehicle simplified data
    const result: Booking = {
      ...bookingInserted,
      vehicle: {
        vehicle_name: vehicle.vehicle_name,
        daily_rent_price: daily,
      },
    };

    return result;
  } catch (err: any) {
    await client.query("ROLLBACK");
    const e: any = new Error(err?.message ?? "Failed to create booking");
    e.status = err?.status ?? 500;
    e.errors = err?.message;
    throw e;
  } finally {
    client.release();
  }
};

/**
 * Get bookings
 * - Admin sees all bookings with customer & vehicle info
 * - Customer sees own bookings only
 */
export const getBookings = async (actor?: Actor | undefined): Promise<Booking[]> => {
  if (!actor) {
    const e: any = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }

  if (actor.role === "admin") {
    const r = await pool.query(
      `SELECT b.*, v.vehicle_name, v.registration_number, v.daily_rent_price, v.type,
              u.name AS customer_name, u.email AS customer_email
       FROM bookings b
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       LEFT JOIN users u ON u.id = b.customer_id
       ORDER BY b.id DESC`
    );

    return r.rows.map((row: any) => ({
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
      },
    }));
  } else {
    const r = await pool.query(
      `SELECT b.*, v.vehicle_name, v.registration_number, v.daily_rent_price, v.type
       FROM bookings b
       LEFT JOIN vehicles v ON v.id = b.vehicle_id
       WHERE b.customer_id = $1
       ORDER BY b.id DESC`,
      [actor.id]
    );

    return r.rows.map((row: any) => ({
      id: row.id,
      customer_id: row.customer_id,
      vehicle_id: row.vehicle_id,
      rent_start_date: row.rent_start_date,
      rent_end_date: row.rent_end_date,
      total_price: row.total_price,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      vehicle: {
        vehicle_name: row.vehicle_name,
        registration_number: row.registration_number,
        type: row.type,
      },
    }));
  }
};

/**
 * Update booking status:
 * - Customer may cancel before start date only (status -> 'cancelled'), which sets vehicle available
 * - Admin may mark 'returned', which sets vehicle available
 */
// helper
const toDate = (v: any): Date => {
  if (v instanceof Date) return v;
  if (typeof v === "string") return parseISO(v);
  // last-resort: construct Date
  return new Date(v);
};

export const updateBooking = async (bookingId: number, status: string, actor?: Actor | undefined): Promise<any> => {
  if (!actor) {
    const e: any = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }

  // fetch booking
  const r = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
  if (r.rowCount === 0) {
    const e: any = new Error("Booking not found");
    e.status = 404;
    throw e;
  }
  const booking = r.rows[0];

  // Customer cancelling
  if (status === "cancelled") {
    if (actor.role === "customer" && actor.id !== booking.customer_id) {
      const e: any = new Error("Forbidden");
      e.status = 403;
      throw e;
    }

    // normalize start date
    const start = toDate(booking.rent_start_date);
    if (!isValid(start)) {
      const e: any = new Error("Invalid booking start date");
      e.status = 500;
      throw e;
    }

    const today = new Date();
    // compare dates (only date portion) — normalize to midnight if you prefer day-based comparison
    if (today >= start) {
      const e: any = new Error("Cancellation allowed only before start date");
      e.status = 400;
      throw e;
    }

    // transaction to cancel...
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [bookingId]);
      await client.query(`UPDATE vehicles SET availability_status = 'available', updated_at = NOW() WHERE id = $1`, [
        booking.vehicle_id,
      ]);
      await client.query("COMMIT");
      const updated = await pool.query(
        `SELECT id, customer_id, vehicle_id, rent_start_date, rent_end_date, total_price, status FROM bookings WHERE id = $1`,
        [bookingId]
      );
      return updated.rows[0];
    } catch (err: any) {
      await client.query("ROLLBACK");
      const e: any = new Error("Failed to cancel booking");
      e.status = 500;
      e.errors = err?.message;
      throw e;
    } finally {
      client.release();
    }
  }

  // Admin marking returned (no parseISO needed here, but safe if you use dates)
  if (status === "returned") {
    if (actor.role !== "admin") {
      const e: any = new Error("Forbidden");
      e.status = 403;
      throw e;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE bookings SET status = 'returned', updated_at = NOW() WHERE id = $1`, [bookingId]);
      await client.query(`UPDATE vehicles SET availability_status = 'available', updated_at = NOW() WHERE id = $1`, [
        booking.vehicle_id,
      ]);
      await client.query("COMMIT");
      const updated = await pool.query(
        `SELECT id, customer_id, vehicle_id, rent_start_date, rent_end_date, total_price, status FROM bookings WHERE id = $1`,
        [bookingId]
      );
      const result = updated.rows[0];
      result.vehicle = { availability_status: "available" };
      return result;
    } catch (err: any) {
      await client.query("ROLLBACK");
      const e: any = new Error("Failed to mark returned");
      e.status = 500;
      e.errors = err?.message;
      throw e;
    } finally {
      client.release();
    }
  }

  const e: any = new Error("Unsupported status update");
  e.status = 400;
  throw e;
};

export const bookingService = {
  createBooking,
  getBookings,
  updateBooking
}
