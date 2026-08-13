import config from "../../config";
import { prisma } from "../../lib/prisma";

type BookingNotification = {
  bookingId: number;
  customerId: number;
  vehicleName: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  transactionCurrency: string;
  displayTotal: number;
  displayCurrency: string;
};

const sendEmail = async (
  to: string,
  booking: BookingNotification,
): Promise<void> => {
  if (!config.resendApiKey || !config.emailFrom) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to],
      subject: `Roadly booking #${booking.bookingId} confirmed`,
      html: `<h1>Your Roadly reservation is confirmed</h1><p>${booking.vehicleName}</p><p>${booking.startDate} to ${booking.endDate}</p><p>Confirmed total: ${booking.displayCurrency} ${booking.displayTotal.toFixed(2)}</p><p>Settlement total: ${booking.transactionCurrency} ${booking.totalPrice.toFixed(2)}</p>`,
    }),
  });
  if (!response.ok)
    throw new Error(`Resend request failed with ${response.status}`);
};

const sendSms = async (
  to: string,
  booking: BookingNotification,
): Promise<void> => {
  if (
    !config.twilioAccountSid ||
    !config.twilioAuthToken ||
    !config.twilioFromNumber
  )
    return;
  const body = new URLSearchParams({
    To: to,
    From: config.twilioFromNumber,
    Body: `Roadly booking #${booking.bookingId} confirmed: ${booking.vehicleName}, ${booking.startDate} to ${booking.endDate}.`,
  });
  const credentials = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`,
  ).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!response.ok)
    throw new Error(`Twilio request failed with ${response.status}`);
};

const sendPhoneVerification = async (
  to: string,
  code: string,
): Promise<boolean> => {
  if (
    !config.twilioAccountSid ||
    !config.twilioAuthToken ||
    !config.twilioFromNumber
  ) {
    return false;
  }
  const body = new URLSearchParams({
    To: to,
    From: config.twilioFromNumber,
    Body: `Your Roadly verification code is ${code}. It expires in 10 minutes.`,
  });
  const credentials = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`,
  ).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Twilio verification request failed with ${response.status}`,
    );
  }
  return true;
};

const sendBookingConfirmation = async (
  booking: BookingNotification,
): Promise<void> => {
  const customer = await prisma.user.findUnique({
    where: { id: booking.customerId },
    select: { email: true, phone: true },
  });
  if (!customer) return;
  const results = await Promise.allSettled([
    sendEmail(customer.email, booking),
    customer.phone ? sendSms(customer.phone, booking) : Promise.resolve(),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Roadly notification failed", result.reason);
    }
  }
};

export const notificationService = {
  sendBookingConfirmation,
  sendPhoneVerification,
};
