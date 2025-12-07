import { pool } from "../../config/db";

type PublicUser = {
  id: number;
  name: string;
  email: string;
  phone: number;
  role: string;
  created_at: string;
  updated_at: string;
};

/**
 * Auth actor shape expected from req.user
 */
type Actor = {
  id: number;
  role: "admin" | "customer";
};

/**
 * Get all users (Admin)
 */
const getAllUsers = async (): Promise<PublicUser[]> => {
  const q = `SELECT id, name, email, phone, role, created_at, updated_at FROM users ORDER BY id`;
  const res = await pool.query(q);
  return res.rows as PublicUser[];
};

/**
 * Update user
 *
 * - actor must be provided (the authenticated user performing the action)
 * - Admin can update any user and change role
 * - Customer can update only their own profile and cannot change role
 */
const updateUser = async (
  userId: number,
  payload: Partial<{ name: string; email: string; phone: string; role: string }>,
  actor?: Actor | undefined
): Promise<PublicUser> => {
  // 1) Require authentication (actor present)
  if (!actor) {
    const e: any = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }

  // 2) Permission checks
  const isAdmin = actor.role === "admin";
  const isOwner = actor.id === userId;
  if (!isAdmin && !isOwner) {
    const e: any = new Error("Forbidden");
    e.status = 403;
    throw e;
  }

  // Customers cannot change role
  if (!isAdmin && payload.role !== undefined) {
    const e: any = new Error("Forbidden: cannot change role");
    e.status = 403;
    throw e;
  }

  // 3) Build dynamic update safely (typed keys)
  const allowedKeys = ["name", "email", "phone", "role"] as const;
  type AllowedKey = typeof allowedKeys[number];

  const updates: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  for (const key of allowedKeys) {
    const value = payload[key];
    if (value !== undefined) {
      // email should be stored lowercased
      if (key === "email") {
        updates.push(`${key} = LOWER($${idx})`);
      } else {
        updates.push(`${key} = $${idx}`);
      }
      vals.push(value);
      idx++;
    }
  }

  // If no updates provided, return current user (or 404 if not found)
  if (updates.length === 0) {
    const cur = await pool.query(
      `SELECT id, name, email, phone, role, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );
    if (cur.rowCount === 0) {
      const e: any = new Error("User not found");
      e.status = 404;
      throw e;
    }
    return cur.rows[0] as PublicUser;
  }

  // 4) Execute update and return updated row
  const updateSql = `
    UPDATE users
    SET ${updates.join(", ")}, updated_at = NOW()
    WHERE id = $${idx}
    RETURNING id, name, email, phone, role, created_at, updated_at
  `;
  vals.push(userId);

  const r = await pool.query(updateSql, vals);
  if (r.rowCount === 0) {
    const e: any = new Error("User not found");
    e.status = 404;
    throw e;
  }

  return r.rows[0] as PublicUser;
};

/**
 * Delete user (Admin only)
 * - Fails if user has active bookings (status = 'active')
 */
const deleteUser = async (userId: number): Promise<void> => {
  const userRes = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (userRes.rowCount === 0) {
    const e: any = new Error("User not found");
    e.status = 404;
    throw e;
  }

  // bookings table must exist and have status column as per API reference
  const bookingRes = await pool.query(
    `SELECT count(*) AS cnt FROM bookings WHERE customer_id = $1 AND status = 'active'`,
    [userId]
  );
  const cnt = Number(bookingRes.rows[0]?.cnt ?? 0);
  if (cnt > 0) {
    const e: any = new Error("Cannot delete user with active bookings");
    e.status = 400;
    throw e;
  }

  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
};

export const userService = {
  getAllUsers,
  updateUser,
  deleteUser
}
