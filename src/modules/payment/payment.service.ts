import Stripe from "stripe";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { rideNotificationService } from "../ride-notification/ride-notification.service";
import { rideService } from "../ride/ride.service";
import { realtimeGateway } from "../realtime/realtime.gateway";
import { driverEarningService } from "../driver-earning/driver-earning.service";

type Actor = { id: number; role: "admin" | "customer" | "driver" };

const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey)
  : null;
const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const integrationStatus = () => ({
  stripeEnabled: Boolean(stripe),
  emailEnabled: Boolean(config.resendApiKey && config.emailFrom),
  smsEnabled: Boolean(
    config.twilioAccountSid &&
    config.twilioAuthToken &&
    config.twilioFromNumber,
  ),
});

const createCheckoutSession = async (bookingId: number, actor: Actor) => {
  if (!stripe) {
    const error: any = new Error(
      "Stripe payments are not configured. Add STRIPE_SECRET_KEY to the backend environment.",
    );
    error.status = 503;
    throw error;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      customerId: true,
      totalPrice: true,
      transactionCurrency: true,
      displayCurrency: true,
      exchangeRate: true,
      displayTotal: true,
      paymentStatus: true,
      rentStartDate: true,
      rentEndDate: true,
      vehicle: { select: { vehicleName: true } },
      customer: { select: { email: true } },
    },
  });
  if (!booking || !booking.vehicle || !booking.customer) {
    const error: any = new Error("Booking not found");
    error.status = 404;
    throw error;
  }
  if (actor.role !== "admin" && actor.id !== booking.customerId) {
    const error: any = new Error("Forbidden");
    error.status = 403;
    throw error;
  }
  if (booking.paymentStatus === "paid") {
    const error: any = new Error("This booking has already been paid");
    error.status = 400;
    throw error;
  }

  const frontendUrl = config.frontendUrl || "http://localhost:4200";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: booking.customer.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(booking.totalPrice) * 100),
          product_data: {
            name: `Roadly rental: ${booking.vehicle.vehicleName}`,
            description: `${booking.rentStartDate.toISOString().slice(0, 10)} to ${booking.rentEndDate.toISOString().slice(0, 10)}`,
          },
        },
      },
    ],
    metadata: {
      bookingId: String(booking.id),
      transactionCurrency: booking.transactionCurrency,
      displayCurrency: booking.displayCurrency,
      exchangeRate: String(booking.exchangeRate),
      displayTotal: String(booking.displayTotal),
    },
    success_url: `${frontendUrl}/bookings?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/bookings?payment=cancelled`,
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      stripeSessionId: session.id,
      paymentStatus: "processing",
      updatedAt: new Date(),
    },
  });

  return { sessionId: session.id, url: session.url };
};

const createRideCheckoutSession = async (rideId: number, actor: Actor) => {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    include: { passenger: { select: { email: true } } },
  });
  if (!ride) {
    const error: any = new Error("Ride not found");
    error.status = 404;
    throw error;
  }
  if (actor.role !== "admin" && actor.id !== ride.passengerId) {
    const error: any = new Error("Forbidden");
    error.status = 403;
    throw error;
  }
  if (ride.status !== "requested") {
    const error: any = new Error(
      "Card authorization is only available before dispatch",
    );
    error.status = 400;
    throw error;
  }
  if (["authorized", "capture_pending", "paid"].includes(ride.paymentStatus)) {
    const error: any = new Error(
      "This ride already has a valid card authorization",
    );
    error.status = 400;
    throw error;
  }
  if (ride.paymentMethod === "cash") {
    const error: any = new Error(
      "This ride was selected for cash payment and does not require Stripe checkout",
    );
    error.status = 400;
    throw error;
  }
  if (!stripe) {
    const error: any = new Error(
      "Stripe payments are not configured. Add STRIPE_SECRET_KEY to the backend environment.",
    );
    error.status = 503;
    throw error;
  }
  if (ride.paymentStatus === "authorization_processing") {
    const previous = await prisma.ridePayment.findFirst({
      where: {
        rideId,
        status: "authorizing",
        checkoutSessionId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    if (previous?.checkoutSessionId) {
      await stripe.checkout.sessions
        .expire(previous.checkoutSessionId)
        .catch(() => null);
      await prisma.ridePayment.update({
        where: { id: previous.id },
        data: { status: "expired", updatedAt: new Date() },
      });
    }
  }
  const estimatedFare = Number(ride.estimatedFare);
  const percentageBuffer =
    estimatedFare * (config.ridesCardAuthorizationBufferPercent / 100);
  const authorizationAmount = money(
    estimatedFare +
      Math.max(percentageBuffer, config.ridesCardAuthorizationBufferMinimum),
  );
  if (authorizationAmount <= 0) {
    const error: any = new Error("No card authorization is required");
    error.status = 400;
    throw error;
  }
  const frontendUrl = config.frontendUrl || "http://localhost:4200";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: ride.passenger.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "myr",
          unit_amount: Math.round(authorizationAmount * 100),
          product_data: {
            name: `Roadly ride authorization ${ride.reference}`,
            description: `Temporary hold for ${ride.pickupAddress} to ${ride.dropoffAddress}. Only the final trip fare is captured.`,
          },
        },
      },
    ],
    metadata: {
      kind: "ride",
      rideId: String(ride.id),
      transactionCurrency: ride.currency,
      displayCurrency: ride.displayCurrency,
      exchangeRate: String(ride.exchangeRate),
      displayEstimatedFare: String(ride.displayEstimatedFare),
    },
    payment_intent_data: {
      capture_method: "manual",
      metadata: {
        kind: "ride",
        rideId: String(ride.id),
        transactionCurrency: ride.currency,
        displayCurrency: ride.displayCurrency,
      },
    },
    success_url: `${frontendUrl}/rides?authorization=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/rides?authorization=cancelled`,
  });
  await prisma.$transaction([
    prisma.ridePayment.create({
      data: {
        rideId: ride.id,
        amount: authorizationAmount,
        currency: "MYR",
        status: "authorizing",
        checkoutSessionId: session.id,
      },
    }),
    prisma.ride.update({
      where: { id: ride.id },
      data: {
        paymentStatus: "authorization_processing",
        updatedAt: new Date(),
      },
    }),
  ]);
  return { sessionId: session.id, url: session.url };
};

const handleWebhook = async (payload: Buffer, signature: string) => {
  if (!stripe || !config.stripeWebhookSecret) {
    const error: any = new Error("Stripe webhook is not configured");
    error.status = 503;
    throw error;
  }
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripeWebhookSecret,
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const kind = session.metadata?.["kind"];
    if (kind === "ride") {
      const rideId = Number(session.metadata?.["rideId"]);
      if (rideId) {
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null;
        const [currentRide, existingPayment] = await Promise.all([
          prisma.ride.findUnique({ where: { id: rideId } }),
          prisma.ridePayment.findUnique({
            where: { checkoutSessionId: session.id },
          }),
        ]);
        if (existingPayment?.status === "authorized") return { received: true };
        if (!currentRide || currentRide.status !== "requested") {
          if (paymentIntentId)
            await stripe.paymentIntents
              .cancel(paymentIntentId)
              .catch(() => null);
          await prisma.ridePayment.updateMany({
            where: { checkoutSessionId: session.id },
            data: { status: "cancelled", updatedAt: new Date() },
          });
          return { received: true };
        }
        const paymentIntent = paymentIntentId
          ? await stripe.paymentIntents.retrieve(paymentIntentId)
          : null;
        if (!paymentIntent || paymentIntent.status !== "requires_capture") {
          await prisma.ride.updateMany({
            where: { id: rideId },
            data: {
              paymentStatus: "authorization_failed",
              updatedAt: new Date(),
            },
          });
          return { received: true };
        }
        await prisma.$transaction([
          prisma.ridePayment.updateMany({
            where: { checkoutSessionId: session.id },
            data: {
              status: "authorized",
              paymentIntentId,
              updatedAt: new Date(),
            },
          }),
          prisma.ride.updateMany({
            where: { id: rideId },
            data: { paymentStatus: "authorized", updatedAt: new Date() },
          }),
        ]);
        const activated =
          (await rideService.activateAuthorizedRide(rideId)) ??
          (await prisma.ride.findUnique({ where: { id: rideId } }));
        if (activated) {
          realtimeGateway.publishRide(activated);
          void rideNotificationService
            .notifyRideUpdate(activated)
            .catch(console.error);
        }
      }
      return { received: true };
    }
    const bookingId = Number(session.metadata?.["bookingId"]);
    if (bookingId) {
      await prisma.booking.updateMany({
        where: { id: bookingId },
        data: { paymentStatus: "paid", updatedAt: new Date() },
      });
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    if (session.metadata?.["kind"] === "ride") {
      const rideId = Number(session.metadata?.["rideId"]);
      const latestPayment = await prisma.ridePayment.findFirst({
        where: { rideId },
        orderBy: { createdAt: "desc" },
      });
      await prisma.$transaction([
        prisma.ridePayment.updateMany({
          where: { checkoutSessionId: session.id },
          data: { status: "expired", updatedAt: new Date() },
        }),
        prisma.ride.updateMany({
          where: {
            id: latestPayment?.checkoutSessionId === session.id ? rideId : -1,
          },
          data: {
            paymentStatus: "authorization_required",
            updatedAt: new Date(),
          },
        }),
      ]);
      return { received: true };
    }
    const bookingId = Number(session.metadata?.["bookingId"]);
    if (bookingId) {
      await prisma.booking.updateMany({
        where: { id: bookingId },
        data: { paymentStatus: "pending", updatedAt: new Date() },
      });
    }
  }

  return { received: true };
};

const captureAuthorizedRidePayment = async (rideId: number) => {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (ride?.paymentStatus === "paid") return "paid";
  const authorization = await prisma.ridePayment.findFirst({
    where: {
      rideId,
      provider: "stripe",
      status: "authorized",
      paymentIntentId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!ride || !authorization?.paymentIntentId || ride.finalFare === null) {
    await prisma.ride.updateMany({
      where: { id: rideId },
      data: { paymentStatus: "payment_failed", updatedAt: new Date() },
    });
    return "payment_failed";
  }
  if (!stripe) {
    await prisma.ride.update({
      where: { id: rideId },
      data: { paymentStatus: "payment_failed", updatedAt: new Date() },
    });
    return "payment_failed";
  }
  const amountToCapture = Math.round(Number(ride.finalFare) * 100);
  try {
    const intent = await stripe.paymentIntents.capture(
      authorization.paymentIntentId,
      { amount_to_capture: amountToCapture },
    );
    if (intent.status !== "succeeded")
      throw new Error("Card capture did not succeed");
    await prisma.$transaction([
      prisma.ridePayment.update({
        where: { id: authorization.id },
        data: {
          status: "paid",
          amount: Number(ride.finalFare),
          paidAt: new Date(),
          updatedAt: new Date(),
        },
      }),
      prisma.ride.update({
        where: { id: rideId },
        data: { paymentStatus: "paid", updatedAt: new Date() },
      }),
    ]);
    await driverEarningService.syncRideEarning(rideId);
    void rideNotificationService.sendRideReceipt(rideId).catch(console.error);
    return "paid";
  } catch (error) {
    console.error("Ride card capture failed", error);
    await prisma.$transaction([
      prisma.ridePayment.update({
        where: { id: authorization.id },
        data: { status: "failed", updatedAt: new Date() },
      }),
      prisma.ride.update({
        where: { id: rideId },
        data: { paymentStatus: "payment_failed", updatedAt: new Date() },
      }),
    ]);
    return "payment_failed";
  }
};

const settleCancelledRidePayment = async (rideId: number) => {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.paymentMethod !== "card")
    return ride?.paymentStatus ?? "not_due";
  if (Number(ride.finalFare ?? 0) > 0)
    return captureAuthorizedRidePayment(rideId);

  const authorization = await prisma.ridePayment.findFirst({
    where: {
      rideId,
      status: { in: ["authorizing", "authorized"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (stripe && authorization?.paymentIntentId) {
    await stripe.paymentIntents
      .cancel(authorization.paymentIntentId)
      .catch(() => null);
  } else if (stripe && authorization?.checkoutSessionId) {
    await stripe.checkout.sessions
      .expire(authorization.checkoutSessionId)
      .catch(() => null);
  }
  await prisma.$transaction([
    ...(authorization
      ? [
          prisma.ridePayment.update({
            where: { id: authorization.id },
            data: { status: "cancelled", updatedAt: new Date() },
          }),
        ]
      : []),
    prisma.ride.update({
      where: { id: rideId },
      data: { paymentStatus: "not_due", updatedAt: new Date() },
    }),
  ]);
  return "not_due";
};

export const paymentService = {
  integrationStatus,
  createCheckoutSession,
  createRideCheckoutSession,
  captureAuthorizedRidePayment,
  settleCancelledRidePayment,
  handleWebhook,
};
