-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."auth_exchange_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_exchange_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bookings" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER,
    "vehicle_id" INTEGER,
    "rent_start_date" DATE NOT NULL,
    "rent_end_date" DATE NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "pickup_location" TEXT DEFAULT 'Downtown Hub',
    "return_location" TEXT DEFAULT 'Downtown Hub',
    "pickup_time" TIME(6) DEFAULT '09:00:00'::time without time zone,
    "return_time" TIME(6) DEFAULT '17:00:00'::time without time zone,
    "insurance_plan" VARCHAR(30) DEFAULT 'none',
    "add_ons" JSONB DEFAULT '[]',
    "special_requests" TEXT DEFAULT '',
    "base_price" DECIMAL(10,2) DEFAULT 0,
    "insurance_fee" DECIMAL(10,2) DEFAULT 0,
    "add_ons_fee" DECIMAL(10,2) DEFAULT 0,
    "discount_amount" DECIMAL(10,2) DEFAULT 0,
    "tax_amount" DECIMAL(10,2) DEFAULT 0,
    "deposit_amount" DECIMAL(10,2) DEFAULT 0,
    "promo_code" VARCHAR(40) DEFAULT '',
    "payment_status" VARCHAR(30) DEFAULT 'pending',
    "stripe_session_id" TEXT,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."phone_verification_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'customer',
    "email" VARCHAR(150) NOT NULL,
    "password" TEXT,
    "phone" VARCHAR(16),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "google_subject" TEXT,
    "avatar_url" TEXT,
    "auth_provider" VARCHAR(30) DEFAULT 'password',
    "email_verified" BOOLEAN DEFAULT false,
    "phone_verified_at" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicles" (
    "id" SERIAL NOT NULL,
    "vehicle_name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "registration_number" VARCHAR(100) NOT NULL,
    "daily_rent_price" DECIMAL(10,2) NOT NULL,
    "availability_status" VARCHAR(50) NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "image_url" TEXT,
    "seats" INTEGER,
    "transmission" VARCHAR(40),
    "fuel_type" VARCHAR(40),
    "location" VARCHAR(120) DEFAULT 'Downtown Hub',
    "rating" DECIMAL(2,1) DEFAULT 5.0,
    "description" TEXT,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_exchange_codes_code_hash_key" ON "public"."auth_exchange_codes"("code_hash" ASC);

-- CreateIndex
CREATE INDEX "idx_bookings_created_at" ON "public"."bookings"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_bookings_customer_id" ON "public"."bookings"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_bookings_status" ON "public"."bookings"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_bookings_vehicle_id" ON "public"."bookings"("vehicle_id" ASC);

-- CreateIndex
CREATE INDEX "idx_phone_verification_user" ON "public"."phone_verification_codes"("user_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "public"."users"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_users_role" ON "public"."users"("role" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- Preserve the database-specific partial uniqueness used for Google account linking.
CREATE UNIQUE INDEX "idx_users_google_subject" ON "public"."users"("google_subject" ASC)
WHERE "google_subject" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_vehicles_availability" ON "public"."vehicles"("availability_status" ASC);

-- CreateIndex
CREATE INDEX "idx_vehicles_created_at" ON "public"."vehicles"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_vehicles_type" ON "public"."vehicles"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registration_number_key" ON "public"."vehicles"("registration_number" ASC);

-- AddForeignKey
ALTER TABLE "public"."auth_exchange_codes" ADD CONSTRAINT "auth_exchange_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."phone_verification_codes" ADD CONSTRAINT "phone_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Preserve business invariants that Prisma does not currently model.
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_total_price_check" CHECK ("total_price" >= 0);
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_daily_rent_price_check" CHECK ("daily_rent_price" > 0);
