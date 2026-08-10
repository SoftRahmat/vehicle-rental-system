# Vehicle Rental System API

Express and TypeScript REST API for Roadly, backed by PostgreSQL with JWT authentication and role-based access control.

The Angular client lives in the sibling `vehicle-rental-angular` repository.

## Features

- Customer registration and sign-in with JWT authentication
- Google OAuth sign-in with verified-email account linking and one-time code exchange
- Twilio phone OTP onboarding required before customer booking creation
- Customer and administrator roles
- Vehicle creation, editing, deletion, date-range availability, imagery, specifications, location, and rating
- Car, bike, van, and SUV fleet types
- Booking creation with date, overlap, and availability validation
- Customer booking history and eligible cancellation
- Administrator booking return workflow
- Administrator user role changes and deletion controls
- Paginated administrator endpoints with search, filtering, and sorting
- Authenticated, booking-aware customer support conversations with an administrator inbox
- Configurable CORS origin for the Angular frontend
- Centralized JSON error responses
- Version-controlled Prisma migrations with an existing-database baseline
- Prisma Client persistence with TypedSQL for optimized availability queries

## Technology

- Node.js
- Express 5
- TypeScript
- PostgreSQL with Prisma 7, `@prisma/adapter-pg`, and `pg`
- JSON Web Tokens
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
FRONTEND_URL=http://localhost:4200
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
RESEND_API_KEY=re_replace_me
EMAIL_FROM=Roadly <bookings@your-domain.example>
TWILIO_ACCOUNT_SID=AC_replace_me
TWILIO_AUTH_TOKEN=replace_me
TWILIO_FROM_NUMBER=+15550000000
```

Do not commit `.env`; it is intentionally ignored by Git.

Generate Prisma Client and apply pending migrations:

```bash
npm run prisma:generate
npm run db:migrate:deploy
```

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

## API overview

### Authentication

| Method | Endpoint                       | Access                   |
| ------ | ------------------------------ | ------------------------ |
| `POST` | `/api/v1/auth/signup`          | Public                   |
| `POST` | `/api/v1/auth/signin`          | Public                   |
| `GET`  | `/api/v1/auth/providers`       | Public                   |
| `GET`  | `/api/v1/auth/google`          | Public OAuth start       |
| `GET`  | `/api/v1/auth/google/callback` | Google callback          |
| `POST` | `/api/v1/auth/google/exchange` | Public one-time exchange |
| `POST` | `/api/v1/auth/phone/send-code` | Authenticated            |
| `POST` | `/api/v1/auth/phone/verify`    | Authenticated            |

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
| `POST` | `/api/v1/payments/stripe/webhook`               | Stripe webhook         |

### Support

| Method  | Endpoint                                           | Access        |
| ------- | -------------------------------------------------- | ------------- |
| `GET`   | `/api/v1/support/options`                          | Authenticated |
| `GET`   | `/api/v1/support/tickets`                          | Authenticated |
| `POST`  | `/api/v1/support/tickets`                          | Customer      |
| `GET`   | `/api/v1/support/tickets/:ticketId`                | Ticket owner  |
| `POST`  | `/api/v1/support/tickets/:ticketId/messages`       | Ticket owner  |
| `GET`   | `/api/v1/admin/support/tickets`                    | Admin         |
| `GET`   | `/api/v1/admin/support/tickets/:ticketId`          | Admin         |
| `POST`  | `/api/v1/admin/support/tickets/:ticketId/messages` | Admin         |
| `PATCH` | `/api/v1/admin/support/tickets/:ticketId`          | Admin         |

Support requests persist customer and administrator messages, may link to an owned booking, and support assignment, priority, read tracking, and lifecycle statuses. The Angular client refreshes active conversations automatically for a near-real-time inbox without exposing anonymous chat.

Stripe Checkout activates only when `STRIPE_SECRET_KEY` is configured. Configure Stripe to send webhook events to `/api/v1/payments/stripe/webhook`. Resend and Twilio notifications activate only when their corresponding environment variables are present.

Google sign-in activates when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured. Register the exact `GOOGLE_CALLBACK_URL` as an authorized redirect URI in Google Cloud. Roadly links verified Google emails, stores Google's stable subject identifier, and redirects Angular with a short-lived one-time exchange code rather than an application token. Customers must verify an international-format phone number before creating a booking. In non-production environments without Twilio credentials, the OTP is returned only as `developmentCode` for local testing.

Send authenticated requests with:

```http
Authorization: Bearer <token>
```

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

The existing Neon database was introspected and baseline migration `20260810053000_baseline_existing_database` was recorded as already applied. Do not run `prisma migrate reset` against shared or production data. For new schema changes, update the Prisma models, create a named development migration, review its SQL, and commit both schema and migration files.

## Deployment

The repository contains `vercel.json` for Vercel deployment. Configure `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and any required platform variables in the deployment environment. Run `npm run db:migrate:deploy` before starting the newly deployed application.

The currently configured production API URL is:

`https://express-project-iota.vercel.app/`

## Current limitations

- No automated backend test suite is configured yet
- Vehicle images use URLs rather than managed file uploads
