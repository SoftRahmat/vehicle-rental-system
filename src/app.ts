import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { authRouter } from "./modules/auth/auth.routes";
import { userRouter } from "./modules/user/user.routes";
import { vehicleRouter } from "./modules/vehicle/vehicle.routes";
import { bookingRouter } from "./modules/booking/booking.routes";
import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import config from "./config";
import { adminRouter } from "./modules/admin/admin.routes";
import { paymentController } from "./modules/payment/payment.controller";
import { paymentRouter } from "./modules/payment/payment.routes";
import { supportRouter } from "./modules/support/support.routes";
import { driverRideRouter, rideRouter } from "./modules/ride/ride.routes";
import { rideNotificationRouter } from "./modules/ride-notification/ride-notification.routes";
import { auth } from "./lib/auth";
import { authRateLimit } from "./middleware/auth-rate-limit";

const app = express();

app.disable("x-powered-by");
if (config.nodeEnv === "production") app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (
    config.nodeEnv === "production" &&
    req.header("x-forwarded-proto") !== "https" &&
    !req.secure
  ) {
    return res.status(400).json({
      success: false,
      message: "HTTPS is required",
    });
  }
  return next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

// dynamic whitelist pattern (dev + prod)
const WHITELIST = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:4200",
  "https://express-project-iota.vercel.app", // CHANGE WITH YOUR PROD BE URL
  ...(config.frontendUrl ? [config.frontendUrl] : []),
];

// Core CORS options
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) return callback(null, true); // server-to-server or curl
    if (WHITELIST.includes(origin)) return callback(null, true);
    return callback(new Error("CORS: Origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
};

// Apply CORS to all requests
app.use(cors(corsOptions));

app.use("/api/v1", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});

// Better Auth must receive the untouched request body.
app.use("/api/v1/auth/session", authRateLimit);
app.all("/api/v1/auth/session", toNodeHandler(auth));
app.all("/api/v1/auth/session/*splat", toNodeHandler(auth));

// Stripe requires the untouched request body for webhook signature verification.
app.post(
  "/api/v1/payments/stripe/webhook",
  express.raw({ type: "application/json" }),
  paymentController.stripeWebhook,
);

// Global preflight middleware
app.use((req, res, next) => {
  if (req.method !== "OPTIONS") return next();

  const origin = req.headers.origin as string | undefined;

  if (!origin) {
    // allow tools like curl / server-to-server (no Origin header)
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", corsOptions.methods.join(","));
    res.header(
      "Access-Control-Allow-Headers",
      corsOptions.allowedHeaders.join(","),
    );
    return res.sendStatus(204);
  }

  if (WHITELIST.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", corsOptions.methods.join(","));
    res.header(
      "Access-Control-Allow-Headers",
      corsOptions.allowedHeaders.join(","),
    );
    return res.sendStatus(204);
  }

  // Not allowed
  return res.status(403).send("CORS: Origin not allowed");
});

// Parser for application routes after the Better Auth handler.
app.use(express.json());

// 👉 Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the Vehicle Rental System API 🚗",
    docs: "/api/v1",
  });
});

// auth router
app.use("/api/v1/auth", authRouter);

// user router
app.use("/api/v1/users", userRouter);

// vehicle router
app.use("/api/v1/vehicles", vehicleRouter);

// booking router
app.use("/api/v1/bookings", bookingRouter);

// Paginated administration endpoints.
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/support", supportRouter);
app.use("/api/v1/rides", rideRouter);
app.use("/api/v1/driver/rides", driverRideRouter);
app.use("/api/v1/notifications", rideNotificationRouter);

// Keep API errors in one predictable shape for web and mobile clients.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({
    success: false,
    message: err?.message ?? "Internal server error",
    ...(err?.errors ? { errors: err.errors } : {}),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

export default app;
