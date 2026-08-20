import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const config = {
  database_url: process.env.DATABASE_URL,
  port: process.env.PORT,
  jwtSecret: process.env.JWT_SECRET,
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? process.env.JWT_SECRET,
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:5000",
  frontendUrl: process.env.FRONTEND_URL,
  mobileTrustedOrigins: (
    process.env.MOBILE_TRUSTED_ORIGINS ?? "roadly://,roadly-driver://"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
  googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleMapsServerKey: process.env.GOOGLE_MAPS_SERVER_KEY,
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ??
    "http://localhost:5000/api/v1/auth/session/callback/google",
  nodeEnv: process.env.NODE_ENV ?? "development",
  ridesCurrency: process.env.RIDES_CURRENCY ?? "MYR",
  defaultDisplayCurrency: process.env.DEFAULT_DISPLAY_CURRENCY ?? "USD",
  currencyRatesJson: process.env.CURRENCY_RATES_JSON,
  currencyRatesUpdatedAt:
    process.env.CURRENCY_RATES_UPDATED_AT ?? "2026-08-13T00:00:00.000Z",
  liveCurrencyRatesEnabled:
    (process.env.LIVE_CURRENCY_RATES_ENABLED ?? "true") === "true",
  currencyRatesProviderUrl:
    process.env.CURRENCY_RATES_PROVIDER_URL ??
    "https://api.frankfurter.dev/v2/rates",
  currencyRatesTimeoutMs: Number(
    process.env.CURRENCY_RATES_TIMEOUT_MS ?? 3000,
  ),
  currencyRatesCacheMinutes: Number(
    process.env.CURRENCY_RATES_CACHE_MINUTES ?? 360,
  ),
  currencyRatesFallbackRetryMinutes: Number(
    process.env.CURRENCY_RATES_FALLBACK_RETRY_MINUTES ?? 5,
  ),
  ridesCardAuthorizationBufferPercent: Number(
    process.env.RIDES_CARD_AUTH_BUFFER_PERCENT ?? 25,
  ),
  ridesCardAuthorizationBufferMinimum: Number(
    process.env.RIDES_CARD_AUTH_BUFFER_MINIMUM ?? 20,
  ),
  driverCommissionPercent: Number(process.env.DRIVER_COMMISSION_PERCENT ?? 20),
  rideOfferTimeoutSeconds: Number(process.env.RIDE_OFFER_TIMEOUT_SECONDS ?? 30),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:support@roadly.example",
};

export default config;
