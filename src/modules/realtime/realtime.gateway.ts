import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { resolveCurrentAuthUser } from "../../middleware/auth";

let io: Server | null = null;

const initialize = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:4200",
        ...(config.frontendUrl ? [config.frontendUrl] : []),
      ],
      credentials: true,
    },
  });
  io.use(async (socket, next) => {
    try {
      const user = await resolveCurrentAuthUser(socket.request.headers);
      if (!user) return next(new Error("Unauthorized"));
      socket.data.user = user;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", async (socket) => {
    const user = socket.data.user as { id: number; role: string };
    socket.join(`user:${user.id}`);
    if (user.role === "admin") socket.join("admins");
    if (user.role === "driver") {
      const profile = await prisma.driverProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (profile) socket.join(`driver:${profile.id}`);
    }
  });
};

const publishRide = (ride: {
  id: number;
  passengerId: number;
  driverId?: number | null;
  driver?: { userId?: number | null } | null;
}) => {
  if (!io) return;
  io.to("admins").to(`user:${ride.passengerId}`).emit("ride:updated", ride);
  if (ride.driverId) {
    const driverAudience = io.to(`driver:${ride.driverId}`);
    if (ride.driver?.userId)
      driverAudience
        .to(`user:${ride.driver.userId}`)
        .emit("ride:updated", ride);
    else driverAudience.emit("ride:updated", ride);
  }
};

const publishNotification = (userId: number, notification: unknown) => {
  io?.to(`user:${userId}`).emit("notification:created", notification);
};

export const realtimeGateway = { initialize, publishRide, publishNotification };
