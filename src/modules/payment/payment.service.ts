import Stripe from "stripe";
import config from "../../config";
import { prisma } from "../../lib/prisma";

type Actor = { id: number; role: "admin" | "customer" };

const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey)
  : null;

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
    metadata: { bookingId: String(booking.id) },
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

export const paymentService = {
  integrationStatus,
  createCheckoutSession,
  handleWebhook,
};
