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



## 🚀 Setup & Installation

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/SoftRahmat/vehicle-rental-system.git
cd vehicle-rental-system

2️⃣ Install Dependencies

npm install

3️⃣ Environment Variables

Create a .env file:

PORT=5000
DATABASE_URL=postgres://username:password@localhost:5432/vehiclerental
JWT_SECRET=your_strong_secret_key

4️⃣ Initialize Database

npm run dev

5️⃣ Start Development Server

npm run dev

🧩 Future Enhancements

Email notifications

Payment integration

Vehicle image uploads

Admin dashboard UI

Cron job automation