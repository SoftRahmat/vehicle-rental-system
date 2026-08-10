import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import type { AuthUser } from "../types/express/index.d.ts";
import { prisma } from "../lib/prisma";

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
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }

  const { id, role, name, email } = payload as {
    id?: number;
    role?: string;
    name?: string;
    email?: string;
  };

  if (!id || !role) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid token payload" });
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

const requireVerifiedPhone = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  if (req.user.role === "admin") return next();
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { phoneVerifiedAt: true },
  });
  if (!user?.phoneVerifiedAt) {
    return res.status(403).json({
      success: false,
      message: "Verify your phone number before creating a booking",
      code: "PHONE_VERIFICATION_REQUIRED",
    });
  }
  return next();
};

export const authGate = {
  requireAuth,
  requireRole,
  requireVerifiedPhone,
};
