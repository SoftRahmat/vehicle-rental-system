import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const config = {
  database_url: process.env.DATABASE_URL,
  port: process.env.PORT,
  jwtSecret: process.env.JWT_SECRET,
  frontendUrl: process.env.FRONTEND_URL,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleMapsServerKey: process.env.GOOGLE_MAPS_SERVER_KEY,
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ??
    "http://localhost:5000/api/v1/auth/google/callback",
  nodeEnv: process.env.NODE_ENV ?? "development",
  ridesCurrency: process.env.RIDES_CURRENCY ?? "MYR",
  ridesCardAuthorizationBufferPercent: Number(
    process.env.RIDES_CARD_AUTH_BUFFER_PERCENT ?? 25,
  ),
  ridesCardAuthorizationBufferMinimum: Number(
    process.env.RIDES_CARD_AUTH_BUFFER_MINIMUM ?? 20,
  ),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:support@roadly.example",
};

export default config;
