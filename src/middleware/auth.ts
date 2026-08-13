import type { IncomingHttpHeaders } from "http";
import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import jwt from "jsonwebtoken";
import config from "../config";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../types/express/index.d.ts";

type Role = "admin" | "customer" | "driver";

const normalizeRole = (role: string): Role =>
  role === "admin" ? "admin" : role === "driver" ? "driver" : "customer";

const loadCurrentUser = async (id: number): Promise<AuthUser | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
  };
};

const legacyJwtUserId = (authorization?: string): number | null => {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  try {
    const payload = jwt.verify(token, config.jwtSecret as string, {
      algorithms: ["HS256"],
      issuer: "roadly-api",
      audience: "roadly-web",
    }) as { id?: number };
    return Number.isInteger(Number(payload.id)) ? Number(payload.id) : null;
  } catch {
    return null;
  }
};

/**
 * Resolve identity from the Better Auth cookie first, then from a short-lived
 * legacy bearer token during migration. Authorization always comes from the
 * current PostgreSQL user row, never from a cached role claim.
 */
export const resolveCurrentAuthUser = async (
  headers: IncomingHttpHeaders,
): Promise<AuthUser | null> => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  const sessionUserId = session?.user?.id
    ? Number(session.user.id)
    : legacyJwtUserId(
        Array.isArray(headers.authorization)
          ? headers.authorization[0]
          : headers.authorization,
      );
  if (!sessionUserId || !Number.isInteger(sessionUserId)) return null;
  return loadCurrentUser(sessionUserId);
};

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = await resolveCurrentAuthUser(req.headers);
    if (!currentUser) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    req.user = currentUser;
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication session",
    });
  }
};

const requireRole =
  (role: Role) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    return next();
  };

const requireAnyRole =
  (roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    return next();
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
  requireAnyRole,
};
