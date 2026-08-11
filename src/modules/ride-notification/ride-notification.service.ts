import webpush from "web-push";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { realtimeGateway } from "../realtime/realtime.gateway";

if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
}

const create = async (
  userId: number,
  rideId: number | null,
  type: string,
  title: string,
  body: string,
) => {
  const notification = await prisma.rideNotification.create({
    data: { userId, rideId, type, title, body },
  });
  realtimeGateway.publishNotification(userId, notification);
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify({
              title,
              body,
              data: { rideId, url: rideId ? "/rides" : "/" },
            }),
          );
        } catch (error: any) {
          if ([404, 410].includes(error?.statusCode))
            await prisma.pushSubscription.delete({
              where: { id: subscription.id },
            });
        }
      }),
    );
  }
  return notification;
};

const notifyRideUpdate = async (ride: any) => {
  const status = String(ride.status).replaceAll("_", " ");
  await create(
    ride.passengerId,
    ride.id,
    "ride_status",
    `Ride ${status}`,
    `${ride.reference} is now ${status}.`,
  );
  const driverUserId = ride.driver?.user?.id;
  if (driverUserId)
    await create(
      driverUserId,
      ride.id,
      "driver_ride",
      `Ride ${status}`,
      `${ride.reference}: ${ride.pickupAddress} to ${ride.dropoffAddress}.`,
    );
};

const notifyDriverRejection = async (ride: any, reason: string) => {
  const reasonLabel = reason.replaceAll("_", " ");
  await create(
    ride.passengerId,
    ride.id,
    "driver_rejected",
    "Finding another driver",
    `${ride.reference}: the assigned driver is unavailable (${reasonLabel}). Roadly is reassigning your ride.`,
  );
};

const list = (userId: number) =>
  prisma.rideNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

const markRead = (notificationId: number, userId: number) =>
  prisma.rideNotification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });

const subscribe = (
  userId: number,
  payload: { endpoint: string; keys: { p256dh: string; auth: string } },
) => {
  if (!payload?.endpoint || !payload.keys?.p256dh || !payload.keys?.auth)
    throw Object.assign(new Error("A valid push subscription is required"), {
      status: 400,
    });
  return prisma.pushSubscription.upsert({
    where: { endpoint: payload.endpoint },
    create: {
      userId,
      endpoint: payload.endpoint,
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
    },
    update: {
      userId,
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
      updatedAt: new Date(),
    },
  });
};

const sendRideReceipt = async (rideId: number) => {
  if (!config.resendApiKey || !config.emailFrom) return;
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { passenger: { select: { email: true, name: true } } },
  });
  if (!ride) return;
  const amount = Number(ride.finalFare ?? ride.estimatedFare);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [ride.passenger.email],
      subject: `Roadly ride receipt ${ride.reference}`,
      html: `<h1>Thanks for riding with Roadly</h1><p>${ride.pickupAddress} → ${ride.dropoffAddress}</p><p>Total: MYR ${amount.toFixed(2)}</p><p>Payment: ${ride.paymentStatus}</p>`,
    }),
  });
};

export const rideNotificationService = {
  create,
  notifyRideUpdate,
  notifyDriverRejection,
  list,
  markRead,
  subscribe,
  sendRideReceipt,
};
