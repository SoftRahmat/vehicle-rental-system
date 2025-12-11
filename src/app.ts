import express from "express";
import initDB from "./config/db";
import { authRouter } from "./modules/auth/auth.routes";
import { userRouter } from "./modules/user/user.routes";
import { vehicleRouter } from "./modules/vehicle/vehicle.routes";
import { bookingRouter } from "./modules/booking/booking.routes";
import cors from "cors";

const app = express();

// dynamic whitelist pattern (dev + prod)
const WHITELIST = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://express-project-iota.vercel.app", // CHANGE WITH YOUR PROD BE URL
];

// Core CORS options
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
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

// Global preflight middleware
app.use((req, res, next) => {
  if (req.method !== "OPTIONS") return next();

  const origin = req.headers.origin as string | undefined;

  if (!origin) {
    // allow tools like curl / server-to-server (no Origin header)
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", corsOptions.methods.join(","));
    res.header("Access-Control-Allow-Headers", corsOptions.allowedHeaders.join(","));
    return res.sendStatus(204);
  }

  if (WHITELIST.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", corsOptions.methods.join(","));
    res.header("Access-Control-Allow-Headers", corsOptions.allowedHeaders.join(","));
    return res.sendStatus(204);
  }

  // Not allowed
  return res.status(403).send("CORS: Origin not allowed");
});

// parser
app.use(express.json());

// initializing DB
initDB();

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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

export default app;
