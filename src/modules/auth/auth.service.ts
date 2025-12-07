import { pool } from "../../config/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "../../config";

/**
 * User returned type (no password included)
 */
type UserDTO = {
  id: number;
  name: string;
  email: string;
  phone: number;
  role: string;
  created_at: string;
  updated_at: string;
};

/**
 * Create signed JWT for user
 * Includes: id, name, email, role
 * Expires: 5 days
 */
const signJwtForUser = (user: {
  id: number;
  name: string;
  email: string;
  role: string;
}): string => {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, config.jwtSecret as string, { expiresIn: "5d" });
};

/**
 * Signup service
 */
const signup = async (input: {
  name: string;
  email: string;
  password: string;
  phone: number;
  role: string;
}): Promise<UserDTO> => {
  const { name, email, password, phone, role } = input;

  // Validate name
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    const e: any = new Error("Name is required and must be at least 2 characters");
    e.status = 400;
    throw e;
  }

  // Validate email
  if (
    !email ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    const e: any = new Error("A valid email address is required");
    e.status = 400;
    throw e;
  }

  if (!password || password.length < 6) {
    const e: any = new Error("Password must be at least 6 characters");
    e.status = 400;
    throw e;
  }

  // Validate phone
  if (
    !phone ||
    typeof phone !== "string" ||
    !/^\+?[0-9]{8,15}$/.test(phone)
  ) {
    const e: any = new Error("A valid phone number is required (8-15 digits)");
    e.status = 400;
    throw e;
  }

  // Validate role
  if (!["admin", "customer"].includes(role)) {
    const e: any = new Error("Role must be either 'admin' or 'customer'");
    e.status = 400;
    throw e;
  }

  // Check existing email
  const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [
    email,
  ]);

  if (existing.rowCount! > 0) {
    const e: any = new Error("Email already registered");
    e.status = 400;
    throw e;
  }

  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(password, salt);

  const insertRes = await pool.query(
    `INSERT INTO users (name, email, phone, role, password)
     VALUES ($1, LOWER($2), $3, $4, $5)
     RETURNING id, name, email, phone, role, created_at, updated_at`,
    [name, email, phone, role, hashed]
  );

  return insertRes.rows[0] as UserDTO;
};

/**
 * Signin service
 */
const signin = async (input: { email: string; password: string }) => {
  const { email, password } = input;

  if (!email || !password) {
    const e: any = new Error("Missing email or password");
    e.status = 400;
    throw e;
  }

  const userRes = await pool.query(
    `SELECT id, name, role, email, password, phone, created_at, updated_at
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  if (userRes.rowCount === 0) {
    const e: any = new Error("Invalid email or password");
    e.status = 401;
    throw e;
  }

  const user = userRes.rows[0];

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    const e: any = new Error("Invalid email or password");
    e.status = 401;
    throw e;
  }

  // SIGN JWT WITH YOUR REQUIRED PAYLOAD
  const token = signJwtForUser({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  const userSafe = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };

  return { token, user: userSafe };
};

export const authService = {
  signup,
  signin,
}
