🚗 Vehicle Rental System (Backend API)

A modular, scalable backend API for managing vehicle rentals, built with **Express.js**, **TypeScript**, **PostgreSQL**, and **JWT Authentication**.

**Live API URL:**  
> https://your-production-api-url.com  
*(Replace with your deployed server URL)*

## 🌟 Features

### 🔐 Authentication & Authorization
- Secure JWT-based login & registration  
- Role-based access: **Admin** and **Customer**  
- Middleware-protected routes  
- Permission rules enforced at service level

### 🚘 Vehicle Management
- Full CRUD for vehicles  
- Availability tracking (`available` → `booked`)  
- Unique registration number validation  
- Vehicle type validation: `car`, `bike`, `van`, `SUV`

### 📅 Booking Management
- Create bookings with strict date validation  
- Prevent overlapping bookings  
- Price calculation: `daily_rate × total_days`  
- Customer cancellation rules (only *before* start date)  
- Admin return flow sets vehicle back to `available`  
- Admin sees **all bookings**, customer sees **only theirs**

### 👤 User Management
- Admin: list, update, delete any user  
- User: update own profile  
- Delete restricted if active bookings exist  
- Email uniqueness enforced (`23505` constraint handling)

### ⚙️ Technical Highlights
- Modular Express architecture  
- TypeScript (strict mode)  
- PostgreSQL via `pg` connection pool  
- Centralized config loader  
- Universal async error wrapper  
- Global error handling middleware  
- Environment-based configuration  
- Production-ready structure

## 🛠️ Technology Stack

### Backend
- Node.js + Express.js  
- TypeScript  
- PostgreSQL (`pg`)  
- JWT Authentication  
- bcryptjs  
- date-fns

### Developer Tools

- VS Code extensions

## 📁 Project Structure

```
├─ src/
│  ├─ config/
│  │  ├─ db.ts
│  │  └─ index.ts
│  ├─ middleware/
│  │  └─ auth.ts
│  ├─ modules/
│  │  ├─ auth/
│  │  │  ├─ auth.controller.ts
│  │  │  ├─ auth.routes.ts
│  │  │  └─ auth.service.ts
│  │  ├─ booking/
│  │  │  ├─ booking.controller.ts
│  │  │  ├─ booking.routes.ts
│  │  │  └─ booking.service.ts
│  │  ├─ user/
│  │  │  ├─ user.controller.ts
│  │  │  ├─ user.routes.ts
│  │  │  └─ user.service.ts
│  │  └─ vehicle/
│  │     ├─ vehicle.controller.ts
│  │     ├─ vehicle.routes.ts
│  │     └─ vehicle.service.ts
│  ├─ types/
│  │  └─ express/
│  │     └─ index.d.ts
│  ├─ utils/
│  │  └─ asyncHandler.ts
│  ├─ app.ts
│  └─ server.ts
├─ .env
├─ .gitignore
├─ package-lock.json
├─ package.json
├─ README.md
├─ tsconfig.json
└─ vercel.json
```

## 🚀 Setup & Installation

### 1️⃣ Clone the Repository

git clone https://github.com/SoftRahmat/vehicle-rental-system.git
cd vehicle-rental-system

### 2️⃣ Install Dependencies

npm install

### 3️⃣ Environment Variables

Create a .env file:

PORT=5000
DATABASE_URL=your DB connetion URL
JWT_SECRET=your_strong_secret_key

### 4️⃣ Initialize Database

npm run dev

### 5️⃣ Start Development Server

npm run dev

## 🧪 Database Initialization
`src/config/db.ts` provides `initDB()` to create required tables (`users`, `vehicles`, `bookings`). On server start we call `initDB()` in `app.ts`.

If running migrations manually, use:

```sql
CREATE TABLE users (...);
CREATE TABLE vehicles (...);
CREATE TABLE bookings (...);
```

---

## 📦 Recommended Deployment Workflow

1. Push to GitHub.
2. On Vercel, import the repo. For Option A, Vercel will build serverless functions automatically.
3. Set Environment Variables in the Vercel dashboard.
4. Trigger deploy.

---

## 🔐 Security & Production Tips

- Use a strong `JWT_SECRET` and rotate periodically.
- Use SSL/TLS for DB connections and API.
- Move sensitive credentials to Vercel Environment Variables (never commit `.env`).
- Add rate-limiting and request validation (zod) for public endpoints.

### 🧩 Future Enhancements

- Email notifications
- Payment integration
- Vehicle image uploads
- Admin dashboard UI
- Cron job automation
