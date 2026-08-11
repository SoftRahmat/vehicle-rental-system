CREATE TABLE "service_zones" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "center_lat" DECIMAL(9,6) NOT NULL,
    "center_lng" DECIMAL(9,6) NOT NULL,
    "radius_km" DECIMAL(6,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_zones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ride_fare_rules" (
    "id" SERIAL NOT NULL,
    "service_type" VARCHAR(20) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MYR',
    "base_fare" DECIMAL(10,2) NOT NULL,
    "per_km_rate" DECIMAL(10,2) NOT NULL,
    "per_minute_rate" DECIMAL(10,2) NOT NULL,
    "booking_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minimum_fare" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ride_fare_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "driver_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "approval_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "availability" VARCHAR(20) NOT NULL DEFAULT 'offline',
    "service_type" VARCHAR(20) NOT NULL,
    "license_number" VARCHAR(80) NOT NULL,
    "vehicle_make" VARCHAR(80) NOT NULL,
    "vehicle_model" VARCHAR(80) NOT NULL,
    "vehicle_plate" VARCHAR(30) NOT NULL,
    "vehicle_color" VARCHAR(40) NOT NULL,
    "seats" INTEGER NOT NULL,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 5,
    "current_lat" DECIMAL(9,6),
    "current_lng" DECIMAL(9,6),
    "last_location_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rides" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "passenger_id" INTEGER NOT NULL,
    "driver_id" INTEGER,
    "service_type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'requested',
    "pickup_address" VARCHAR(240) NOT NULL,
    "pickup_lat" DECIMAL(9,6) NOT NULL,
    "pickup_lng" DECIMAL(9,6) NOT NULL,
    "dropoff_address" VARCHAR(240) NOT NULL,
    "dropoff_lat" DECIMAL(9,6) NOT NULL,
    "dropoff_lng" DECIMAL(9,6) NOT NULL,
    "distance_meters" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MYR',
    "base_fare" DECIMAL(10,2) NOT NULL,
    "distance_fare" DECIMAL(10,2) NOT NULL,
    "time_fare" DECIMAL(10,2) NOT NULL,
    "booking_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimated_fare" DECIMAL(10,2) NOT NULL,
    "final_fare" DECIMAL(10,2),
    "routing_provider" VARCHAR(30) NOT NULL,
    "cancellation_reason" VARCHAR(240),
    "requested_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMP(6),
    "arrived_at" TIMESTAMP(6),
    "started_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "cancelled_at" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ride_status_events" (
    "id" SERIAL NOT NULL,
    "ride_id" INTEGER NOT NULL,
    "actor_id" INTEGER,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30) NOT NULL,
    "note" VARCHAR(240),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ride_status_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ride_fare_rules_service_type_key" ON "ride_fare_rules"("service_type");
CREATE UNIQUE INDEX "driver_profiles_user_id_key" ON "driver_profiles"("user_id");
CREATE UNIQUE INDEX "driver_profiles_license_number_key" ON "driver_profiles"("license_number");
CREATE UNIQUE INDEX "driver_profiles_vehicle_plate_key" ON "driver_profiles"("vehicle_plate");
CREATE UNIQUE INDEX "rides_reference_key" ON "rides"("reference");
CREATE INDEX "idx_service_zones_city_active" ON "service_zones"("city", "active");
CREATE INDEX "idx_driver_dispatch" ON "driver_profiles"("approval_status", "availability", "service_type");
CREATE INDEX "idx_rides_passenger" ON "rides"("passenger_id", "requested_at" DESC);
CREATE INDEX "idx_rides_driver_status" ON "rides"("driver_id", "status");
CREATE INDEX "idx_rides_dispatch_queue" ON "rides"("status", "requested_at");
CREATE INDEX "idx_ride_status_events_ride" ON "ride_status_events"("ride_id", "created_at");

ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "rides" ADD CONSTRAINT "rides_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "ride_status_events" ADD CONSTRAINT "ride_status_events_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "ride_status_events" ADD CONSTRAINT "ride_status_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "ride_fare_rules" ADD CONSTRAINT "ride_fare_rules_service_type_check" CHECK ("service_type" IN ('bike', 'car', 'xl'));
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_service_type_check" CHECK ("service_type" IN ('bike', 'car', 'xl'));
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_approval_check" CHECK ("approval_status" IN ('pending', 'approved', 'suspended'));
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_availability_check" CHECK ("availability" IN ('offline', 'available', 'on_trip'));
ALTER TABLE "rides" ADD CONSTRAINT "rides_service_type_check" CHECK ("service_type" IN ('bike', 'car', 'xl'));
ALTER TABLE "rides" ADD CONSTRAINT "rides_status_check" CHECK ("status" IN ('requested', 'driver_assigned', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed', 'customer_cancelled', 'admin_cancelled', 'no_driver_available'));

INSERT INTO "service_zones" ("name", "city", "country_code", "center_lat", "center_lng", "radius_km")
VALUES ('Kuala Lumpur service area', 'Kuala Lumpur', 'MY', 3.139000, 101.686900, 35.00);

INSERT INTO "ride_fare_rules" ("service_type", "currency", "base_fare", "per_km_rate", "per_minute_rate", "booking_fee", "minimum_fare") VALUES
('bike', 'MYR', 3.00, 0.65, 0.15, 0.50, 5.00),
('car',  'MYR', 5.00, 1.20, 0.25, 1.00, 8.00),
('xl',   'MYR', 8.00, 1.80, 0.35, 1.50, 14.00);
