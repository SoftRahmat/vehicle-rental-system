# Vehicle Rental System API

Express and TypeScript REST API for Roadly, backed by PostgreSQL with JWT authentication and role-based access control.

The Angular client lives in the sibling `vehicle-rental-angular` repository.

## Features

- Customer registration and sign-in with JWT authentication
- Customer and administrator roles
- Vehicle creation, editing, deletion, availability, and image URLs
- Car, bike, van, and SUV fleet types
- Booking creation with date, overlap, and availability validation
- Customer booking history and eligible cancellation
- Administrator booking return workflow
- Administrator user role changes and deletion controls
- Paginated administrator endpoints with search, filtering, and sorting
- Configurable CORS origin for the Angular frontend
- Centralized JSON error responses
- Automatic PostgreSQL table initialization during application startup

## Technology

- Node.js
- Express 5
- TypeScript
- PostgreSQL with `pg`
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
```

Do not commit `.env`; it is intentionally ignored by Git.

Start the development server:

```bash
npm run dev
```

The API is available at `http://localhost:5000/api/v1`.

## Scripts

| Command         | Description                               |
| --------------- | ----------------------------------------- |
| `npm run dev`   | Start the TypeScript server in watch mode |
| `npm run build` | Compile TypeScript into `dist`            |

## API overview

### Authentication

| Method | Endpoint              | Access |
| ------ | --------------------- | ------ |
| `POST` | `/api/v1/auth/signup` | Public |
| `POST` | `/api/v1/auth/signin` | Public |

### Vehicles

| Method   | Endpoint                      | Access |
| -------- | ----------------------------- | ------ |
| `GET`    | `/api/v1/vehicles`            | Public |
| `GET`    | `/api/v1/vehicles/:vehicleId` | Public |
| `POST`   | `/api/v1/vehicles`            | Admin  |
| `PUT`    | `/api/v1/vehicles/:vehicleId` | Admin  |
| `DELETE` | `/api/v1/vehicles/:vehicleId` | Admin  |

### Bookings

| Method | Endpoint                      | Access                          |
| ------ | ----------------------------- | ------------------------------- |
| `GET`  | `/api/v1/bookings`            | Authenticated                   |
| `POST` | `/api/v1/bookings`            | Authenticated                   |
| `PUT`  | `/api/v1/bookings/:bookingId` | Authenticated, role rules apply |

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

Send authenticated requests with:

```http
Authorization: Bearer <token>
```

## Project structure

```text
src/
  config/       Environment and PostgreSQL configuration
  middleware/   Authentication and authorization middleware
  modules/
    admin/      Dashboard and paginated administration queries
    auth/       Registration and sign-in
    booking/    Rental lifecycle
    user/       Account management
    vehicle/    Fleet management
  types/        Express type extensions
  utils/        Shared server utilities
  app.ts        Express application
  server.ts     Development server entry point
```

## Deployment

The repository contains `vercel.json` for Vercel deployment. Configure `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and any required platform variables in the deployment environment.

The currently configured production API URL is:

`https://express-project-iota.vercel.app/`

## Current limitations

- No automated backend test suite is configured yet
- Vehicle images use URLs rather than managed file uploads
- Payments and notification delivery are not implemented
