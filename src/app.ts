import express from "express";
import initDB from "./config/db";
import { authRouter } from "./modules/auth/auth.routes";
import { userRouter } from "./modules/user/user.routes";
import { vehicleRouter } from "./modules/vehicle/vehicle.routes";
import { bookingRouter } from "./modules/booking/booking.routes";


const app = express();
// parser
app.use(express.json());
// app.use(express.urlencoded());

// initializing DB
initDB();

//auth router
app.use("/api/v1/auth", authRouter);

//user router
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
