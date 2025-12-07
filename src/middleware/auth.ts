import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import type { AuthUser } from "../types/express/index.d.ts";

// verifyJwt stays permissive but we will narrow before attaching
const verifyJwt = (token: string): any => {
  try {
    return jwt.verify(token, config.jwtSecret as string);
  } catch (err) {
    throw new Error("Invalid or expired token");
  }
};

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const token = header.replace("Bearer ", "").trim();

  let payload: any;
  try {
    payload = verifyJwt(token);
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  const { id, role, name, email } = payload as {
    id?: number;
    role?: string;
    name?: string;
    email?: string;
  };

  if (!id || !role) {
    return res.status(401).json({ success: false, message: "Invalid token payload" });
  }

  // Create an AuthUser and attach it (ensures proper shape)
  const authUser: AuthUser = {
    id: Number(id),
    role: role === "admin" ? "admin" : "customer",
  };
  if (name) authUser.name = String(name);
  if (email) authUser.email = String(email);

  req.user = authUser;

  return next();
};

const requireRole = (role: "admin" | "customer") => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    return next();
  };
};

export const authGate = {
  requireAuth,
  requireRole
}