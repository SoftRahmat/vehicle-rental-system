# Vehicle Rental System API

Express and TypeScript REST API for Roadly, backed by PostgreSQL with Better Auth cookie sessions and database-authoritative role-based access control.

The Angular client lives in the sibling `vehicle-rental-angular` repository.

## Features

- Customer registration and sign-in with revocable, HttpOnly Better Auth sessions
- Google OAuth sign-in through Better Auth with verified-email account linking
- Current PostgreSQL role resolution on every protected HTTP and Socket.IO connection
- Authentication throttling, 12-character password policy, secure response headers, and production HTTPS enforcement
- Phone verification is automatically revoked whenever the stored phone number changes
- Twilio phone OTP onboarding required before customer booking creation
- Customer, administrator, and dedicated driver roles
- Vehicle creation, editing, deletion, date-range availability, imagery, specifications, location, and rating
- Car, bike, van, and SUV fleet types
- Booking creation with date, overlap, and availability validation
- Customer booking history and eligible cancellation
- Administrator booking return workflow
- Administrator user role changes and deletion controls
- Paginated administrator endpoints with search, filtering, and sorting
- Authenticated customer and driver support conversations linked to rental bookings or Roadly rides
- Separate Roadly Rides product for immediate Bike, Car, and XL trips in Kuala Lumpur
- Google Routes-backed distance and duration quotes with signed five-minute fare tokens
- MYR fare rules stored in PostgreSQL and seeded per ride type
- Driver portal with live GPS, online/offline controls, navigation, and controlled trip progression
- Automatic nearest-driver matching with manual administrator dispatch fallback
- Driver ride rejection with required structured reasons, permanent audit history, passenger/admin visibility, and automatic reassignment that excludes drivers who already rejected the ride
- Socket.IO ride updates for passengers, drivers, and dispatchers
- MYR card pre-authorization before dispatch, automatic final-fare capture, automatic waiting charges, driver-entered tolls, promotional discounts, receipts, and Web Push notifications
- Public multi-currency display metadata for USD, MYR, EUR, GBP, SGD, and AUD, while preserving USD rental and MYR ride settlement
- Cash rides are settled directly with the assigned driver and recorded as paid only after the driver confirms collection
- Administrator toll corrections before completion, with waiting derived from arrival/start timestamps and the final fare locked at completion
- Configurable CORS origin for the Angular frontend
- Centralized JSON error responses
- Version-controlled Prisma migrations with an existing-database baseline
- Prisma Client persistence with TypedSQL for optimized availability queries

## Technology

- Node.js
- Express 5
- TypeScript
- PostgreSQL with Prisma 7, `@prisma/adapter-pg`, and `pg`
- Better Auth sessions, with short-lived JWT support retained only during migration
- bcryptjs
- date-fns

## Local setup

### Requirements

- Node.js 20 or newer
- npm
- PostgreSQL

### Installation

```bash
npm install
```

Create a `.env` file in the project root:

```env
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/vehicle_rental
JWT_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_SECRET=replace-with-a-different-random-secret-of-at-least-32-characters
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:4200
GOOGLE_CLIENT_ID=replace-with-google-web-client-id
GOOGLE_ANDROID_CLIENT_ID=replace-with-google-android-client-id
GOOGLE_IOS_CLIENT_ID=replace-with-google-ios-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/session/callback/google
GOOGLE_MAPS_SERVER_KEY=replace-with-google-routes-server-key
RIDES_CURRENCY=MYR
DEFAULT_DISPLAY_CURRENCY=USD
CURRENCY_RATES_JSON={"USD":1,"MYR":4.45,"EUR":0.92,"GBP":0.78,"SGD":1.35,"AUD":1.52}
CURRENCY_RATES_UPDATED_AT=2026-08-13T00:00:00.000Z
LIVE_CURRENCY_RATES_ENABLED=true
CURRENCY_RATES_PROVIDER_URL=https://api.frankfurter.dev/v2/rates
CURRENCY_RATES_TIMEOUT_MS=3000
CURRENCY_RATES_CACHE_MINUTES=360
CURRENCY_RATES_FALLBACK_RETRY_MINUTES=5
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
RESEND_API_KEY=re_replace_me
EMAIL_FROM=Roadly <bookings@your-domain.example>
TWILIO_ACCOUNT_SID=AC_replace_me
TWILIO_AUTH_TOKEN=replace_me
TWILIO_FROM_NUMBER=+15550000000
VAPID_PUBLIC_KEY=replace-with-vapid-public-key
VAPID_PRIVATE_KEY=replace-with-vapid-private-key
VAPID_SUBJECT=mailto:support@your-domain.example
```

Do not commit `.env`; it is intentionally ignored by Git.

Generate Prisma Client and apply pending migrations:

```bash
npm run prisma:generate
npm run db:migrate:deploy
```

The Better Auth migration is incremental and preserves the existing `users` table and integer user IDs. `auth_sessions`, `auth_accounts`, and `auth_verifications` use database-generated numeric primary keys so Better Auth's Prisma adapter can safely reference Roadly's integer users. Existing password and Google account links are backfilled by the committed migrations.

Start the development server:

```bash
npm run dev
```

The API is available at `http://localhost:5000/api/v1`.

## Scripts

| Command                     | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `npm run dev`               | Start the TypeScript server in watch mode         |
| `npm run build`             | Generate Prisma Client and compile TypeScript     |
| `npm run prisma:generate`   | Regenerate the type-safe database client          |
| `npm run db:migrate:dev`    | Create and apply a development migration          |
| `npm run db:migrate:deploy` | Apply committed migrations without resetting DB   |
| `npm run db:status`         | Compare migration history with the configured DB  |
| `npm run db:smoke`          | Read-only Prisma connection and model count check |
| `npm run test:security`     | Run the role and ownership authorization matrix   |
| `npm test`                  | Run all backend tests, including security headers |

## API overview

### Authentication

| Method | Endpoint                              | Access        |
| ------ | ------------------------------------- | ------------- |
| `POST` | `/api/v1/auth/session/sign-up/email`  | Public        |
| `POST` | `/api/v1/auth/session/sign-in/email`  | Public        |
| `POST` | `/api/v1/auth/session/sign-in/social` | Public        |
| `POST` | `/api/v1/auth/session/sign-out`       | Authenticated |
| `GET`  | `/api/v1/auth/me`                     | Authenticated |
| `GET`  | `/api/v1/auth/providers`              | Public        |
| `POST` | `/api/v1/auth/phone/send-code`        | Authenticated |
| `POST` | `/api/v1/auth/phone/verify`           | Authenticated |

### Vehicles

| Method   | Endpoint                                        | Access |
| -------- | ----------------------------------------------- | ------ |
| `GET`    | `/api/v1/vehicles`                              | Public |
| `GET`    | `/api/v1/vehicles/:vehicleId`                   | Public |
| `GET`    | `/api/v1/vehicles/:vehicleId/availability`      | Public |
| `GET`    | `/api/v1/vehicles/:vehicleId/unavailable-dates` | Public |
| `POST`   | `/api/v1/vehicles`                              | Admin  |
| `PUT`    | `/api/v1/vehicles/:vehicleId`                   | Admin  |
| `DELETE` | `/api/v1/vehicles/:vehicleId`                   | Admin  |

### Bookings

| Method | Endpoint                      | Access                            |
| ------ | ----------------------------- | --------------------------------- |
| `GET`  | `/api/v1/bookings`            | Authenticated                     |
| `POST` | `/api/v1/bookings`            | Authenticated                     |
| `PUT`  | `/api/v1/bookings/:bookingId` | Authenticated, role rules apply   |
| `GET`  | `/api/v1/bookings/options`    | Public rental and pricing options |

### Users

| Method   | Endpoint                | Access                 |
| -------- | ----------------------- | ---------------------- |
| `GET`    | `/api/v1/users`         | Admin                  |
| `PUT`    | `/api/v1/users/:userId` | Admin or account owner |
| `DELETE` | `/api/v1/users/:userId` | Admin                  |

### Administration

| Method | Endpoint                        | Description               |
| ------ | ------------------------------- | ------------------------- |
| `GET`  | `/api/v1/admin/dashboard/stats` | Dashboard totals          |
| `GET`  | `/api/v1/admin/vehicles`        | Paginated fleet records   |
| `GET`  | `/api/v1/admin/bookings`        | Paginated booking records |
| `GET`  | `/api/v1/admin/users`           | Paginated user records    |

Administrator list endpoints accept these common query parameters:

- `page`: page number, default `1`
- `pageSize`: records per request, default `15`, maximum `100`
- `search`: text search
- `sortBy`: supported database field
- `sortOrder`: `asc` or `desc`

Endpoint-specific filters include `type`, `status`, and `role`. Responses include `items`, `page`, `pageSize`, `total`, and `totalPages`.

### Payments

| Method | Endpoint                                        | Access                 |
| ------ | ----------------------------------------------- | ---------------------- |
| `GET`  | `/api/v1/payments/status`                       | Public                 |
| `POST` | `/api/v1/payments/bookings/:bookingId/checkout` | Booking owner or admin |
| `POST` | `/api/v1/payments/rides/:rideId/checkout`       | Ride owner or admin    |
| `POST` | `/api/v1/payments/stripe/webhook`               | Stripe webhook         |

### Support

| Method  | Endpoint                                           | Access             |
| ------- | -------------------------------------------------- | ------------------ |
| `GET`   | `/api/v1/support/options`                          | Authenticated      |
| `GET`   | `/api/v1/support/tickets`                          | Authenticated      |
| `POST`  | `/api/v1/support/tickets`                          | Customer or driver |
| `GET`   | `/api/v1/support/tickets/:ticketId`                | Ticket owner       |
| `POST`  | `/api/v1/support/tickets/:ticketId/messages`       | Ticket owner       |
| `GET`   | `/api/v1/admin/support/tickets`                    | Admin              |
| `GET`   | `/api/v1/admin/support/tickets/:ticketId`          | Admin              |
| `POST`  | `/api/v1/admin/support/tickets/:ticketId/messages` | Admin              |
| `PATCH` | `/api/v1/admin/support/tickets/:ticketId`          | Admin              |

Support requests persist customer, driver, and administrator messages; may link to an owned rental booking or Roadly ride; and support assignment, priority, read tracking, and lifecycle statuses. The Angular client refreshes active conversations automatically for a near-real-time inbox without exposing anonymous chat.

### Roadly Rides

| Method  | Endpoint                              | Access   | Description                            |
| ------- | ------------------------------------- | -------- | -------------------------------------- |
| `GET`   | `/api/v1/rides/options`               | Public   | KL service zone and MYR fare rules     |
| `GET`   | `/api/v1/currencies`                  | Public   | Supported display currencies and rates |
| `POST`  | `/api/v1/rides/quote`                 | Customer | Calculate a signed five-minute fare    |
| `POST`  | `/api/v1/rides`                       | Customer | Request an immediate ride              |
| `GET`   | `/api/v1/rides`                       | Customer | Current and previous rides             |
| `POST`  | `/api/v1/rides/:rideId/cancel`        | Customer | Cancel an eligible ride                |
| `GET`   | `/api/v1/admin/rides`                 | Admin    | Paginated dispatch queue               |
| `GET`   | `/api/v1/admin/drivers`               | Admin    | Driver roster                          |
| `POST`  | `/api/v1/admin/drivers`               | Admin    | Create a driver profile                |
| `PATCH` | `/api/v1/admin/drivers/:driverId`     | Admin    | Change approval or availability        |
| `POST`  | `/api/v1/admin/rides/:rideId/assign`  | Admin    | Manually assign a matching driver      |
| `PATCH` | `/api/v1/admin/rides/:rideId/status`  | Admin    | Advance the controlled ride state      |
| `PATCH` | `/api/v1/admin/rides/:rideId/charges` | Admin    | Correct toll charges before completion |

The administrator ride list accepts comma-separated `status` values for grouped operational views and an optional `attention` filter. Supported attention values are `awaiting_card`, `driver_rejected`, and `cash_confirmation`. Responses include status-group counts for needs-action, active, completed, cancelled, and all-ride tabs.

### Driver operations

| Method  | Endpoint                              | Description                          |
| ------- | ------------------------------------- | ------------------------------------ |
| `GET`   | `/api/v1/driver/rides/profile`        | Retrieve the signed-in driver        |
| `PATCH` | `/api/v1/driver/rides/availability`   | Go online or offline                 |
| `PATCH` | `/api/v1/driver/rides/location`       | Publish the driver's GPS position    |
| `GET`   | `/api/v1/driver/rides/active`         | Retrieve the assigned active ride    |
| `POST`  | `/api/v1/driver/rides/:rideId/reject` | Reject and return a ride to dispatch |
| `PATCH` | `/api/v1/driver/rides/:rideId/status` | Advance the trip safely              |

Drivers may reject a ride while it is `driver_assigned` or `driver_arriving`. The request must contain one of the supported reasons:

```json
{
  "reason": "not_available",
  "details": "Optional context, required when reason is other"
}
```

Supported values are `not_available`, `too_far`, and `other`. Selecting `other` requires details. Every rejection is stored with the ride, driver, reason, details, and timestamp. The rejecting driver is excluded from later assignment attempts for that ride. A `not_available` rejection also takes the driver offline; the other reasons leave the driver eligible for different rides.

After rejection, the ride returns to `requested` and Roadly immediately attempts to assign the nearest eligible driver. Passenger, administrator, and newly assigned driver sessions receive the updated ride through Socket.IO. The passenger also receives an in-app/Web Push notification when enabled. If no replacement is currently available, the request remains visible in the administrator dispatch queue for manual assignment.

### Ride notifications

| Method  | Endpoint                                     | Description                     |
| ------- | -------------------------------------------- | ------------------------------- |
| `GET`   | `/api/v1/notifications/config`               | Retrieve public push capability |
| `GET`   | `/api/v1/notifications`                      | List the user's notifications   |
| `PATCH` | `/api/v1/notifications/:notificationId/read` | Mark a notification read        |
| `POST`  | `/api/v1/notifications/push-subscriptions`   | Register a browser subscription |

Roadly Rides is intentionally separate from daily vehicle rentals. It supports immediate bookings, nearest-driver matching, driver live location, and manual dispatch fallback in a 35 km Kuala Lumpur service radius. Configure `GOOGLE_MAPS_SERVER_KEY` with a key restricted to Google Routes API. Development falls back to a clearly identified local route estimate when the key is absent; production does not.

Stripe Checkout activates only when `STRIPE_SECRET_KEY` is configured. Configure Stripe to send `checkout.session.completed` and `checkout.session.expired` events to `/api/v1/payments/stripe/webhook`. Generate VAPID keys with `npx web-push generate-vapid-keys` to enable opt-in browser notifications. Resend and Twilio notifications activate only when their corresponding environment variables are present.

Card rides use separate authorization and capture. Checkout places a temporary hold for the estimated fare plus the greater of `RIDES_CARD_AUTH_BUFFER_PERCENT` or `RIDES_CARD_AUTH_BUFFER_MINIMUM`. Dispatch starts only after the authorization webhook succeeds. At completion, Roadly captures the exact final fare and Stripe releases the unused hold. Cash rides bypass Stripe and are marked paid only when the assigned driver confirms receipt.

Display conversion rates are loaded server-side from the free Frankfurter reference-rate API and cached in memory. If the provider times out, returns an error, or sends an invalid response, the API returns the configured `CURRENCY_RATES_JSON` values instead. These rates affect presentation only; rentals still settle in USD and rides still settle in MYR.

Each new booking and ride stores an immutable confirmation snapshot containing its transaction currency, selected display currency, applied exchange rate, converted confirmation amount, provider/fallback source, and capture timestamp. Existing records are backfilled as USD rentals or MYR rides at a legacy `1.0` rate. Stripe metadata, API receipts, and booking notifications retain both display and settlement context, so historical confirmations do not change when current FX rates change.

Google sign-in activates when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured. `GOOGLE_CLIENT_ID` is the Web OAuth client and must remain first because it owns the browser callback. Optional `GOOGLE_ANDROID_CLIENT_ID` and `GOOGLE_IOS_CLIENT_ID` values extend the accepted native ID-token audiences. Register the exact Better Auth callback (`/api/v1/auth/session/callback/google`) as an authorized redirect URI in Google Cloud. Better Auth stores browser sessions in an HttpOnly cookie and returns signed Bearer sessions to native clients; neither client receives the Google secret. Customers must verify an international-format phone number before creating a booking, and changing that phone number clears its verification status. In non-production environments without Twilio credentials, the OTP is returned only as `developmentCode` for local testing.

Browser clients authenticate with the Roadly HttpOnly session cookie and must send credentials. A 15-minute bearer JWT remains temporarily accepted for legacy clients, but its role claim is ignored in favor of the current database role:

```http
Authorization: Bearer <token>
```

Better Auth sessions are revocable and stored in PostgreSQL. Every protected HTTP request and Socket.IO connection reloads the current Roadly user and role, so deletion or role demotion takes effect without waiting for a token to expire. Authentication endpoints are rate-limited, API responses use `no-store`, and Helmet supplies CSP and related browser hardening headers.

The fleet endpoint optionally accepts `startDate` and `endDate` in `YYYY-MM-DD` format and returns `available_for_period` plus the next available date. The individual vehicle availability endpoint accepts the same date range and returns inclusive rental days, pricing, and available alternatives. The unavailable-dates endpoint returns active future booking ranges for the reservation calendar.

## Project structure

```text
src/
  config/       Environment configuration
  generated/    Generated Prisma Client; not committed
  lib/          Shared Prisma Client
  middleware/   Authentication and authorization middleware
  modules/
    admin/      Dashboard and paginated administration queries
    auth/       Registration and sign-in
    booking/    Rental lifecycle
    support/    Authenticated support conversations
    ride/       Quotes, routing, ride lifecycle, drivers and dispatch
    user/       Account management
    vehicle/    Fleet management
  types/        Express type extensions
  utils/        Shared server utilities
  app.ts        Express application
  server.ts     Development server entry point
prisma/
  schema/       Split auth, vehicle, and booking Prisma models
  sql/          Type-safe availability and fleet SQL queries
  migrations/   Version-controlled SQL migration history
  prisma.config.ts is stored at the repository root
```

## Database architecture

Roadly uses Prisma throughout its database layer:

- Authentication, users, vehicles, bookings, payments, notifications, administration, Google account linking, exchange codes, and phone OTP persistence use Prisma Client.
- Booking creation locks the selected vehicle and runs overlap validation, booking creation, and fleet-state changes in an isolated Prisma transaction.
- Fleet availability, unavailable ranges, and alternative recommendations use Prisma TypedSQL so the optimized PostgreSQL behavior remains type-safe and version controlled.
- The runtime connects through `@prisma/adapter-pg`; services do not create or use a separate legacy `pg` pool.
- PostgreSQL check constraints and the partial unique Google-subject index remain explicitly preserved in migration SQL.
- Better Auth uses numeric-ID mode (`generateId: "serial"`) to remain compatible with Roadly's existing integer `users.id`; changing it back to string generation will cause Prisma relation validation errors.
- Driver rejection analytics are backed by `driver_ride_rejections`, with indexed ride/time and driver/reason/time access paths. This preserves complete rejection history for future operational reporting rather than overwriting a single reason on the ride.

The existing Neon database was introspected and baseline migration `20260810053000_baseline_existing_database` was recorded as already applied. Do not run `prisma migrate reset` against shared or production data. For new schema changes, update the Prisma models, create a named development migration, review its SQL, and commit both schema and migration files.

## Deployment

The repository contains `vercel.json` for Vercel deployment. Configure `DATABASE_URL`, `JWT_SECRET`, `BETTER_AUTH_SECRET`, `BACKEND_URL`, `FRONTEND_URL`, and any required platform variables in the deployment environment. Production rejects non-HTTPS API requests and Better Auth emits secure cookies. Run `npm run db:migrate:deploy` before starting the newly deployed application.

The currently configured production API URL is:

`https://express-project-iota.vercel.app/`

## Authentication troubleshooting

- A `500` from `/api/v1/auth/session/sign-in/email` after migrating an integer-ID database usually means Better Auth is not running in numeric-ID mode. Keep `advanced.database.generateId` set to `"serial"`, apply all committed migrations, and regenerate Prisma Client.
- After pulling authentication migrations, run `npm run db:migrate:deploy` followed by `npm run prisma:generate`, then restart the backend process.
- Existing passwords remain valid. The stronger password requirements apply to new registrations and future password changes.
- For local Google sign-in, the exact authorized redirect URI is `http://localhost:5000/api/v1/auth/session/callback/google`. Do not add a trailing slash or query parameters.
- Cross-origin browser requests must use credentials and the request origin must match `FRONTEND_URL`.

## Current limitations

- Broader controller and service integration coverage is still being expanded beyond the authorization matrix
- Vehicle images use URLs rather than managed file uploads
