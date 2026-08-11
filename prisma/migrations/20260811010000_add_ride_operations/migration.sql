ALTER TABLE "ride_fare_rules"
ADD COLUMN "cancellation_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "included_wait_minutes" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "wait_per_minute_rate" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "rides"
ADD COLUMN "waiting_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "toll_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "cancellation_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "promo_code_id" INTEGER,
ADD COLUMN "payment_method" VARCHAR(20) NOT NULL DEFAULT 'card',
ADD COLUMN "payment_status" VARCHAR(30) NOT NULL DEFAULT 'pending';

CREATE TABLE "ride_promo_codes" (
  "id" SERIAL NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "discount_type" VARCHAR(20) NOT NULL,
  "discount_value" DECIMAL(10,2) NOT NULL,
  "maximum_discount" DECIMAL(10,2),
  "minimum_fare" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMP(6) NOT NULL,
  "ends_at" TIMESTAMP(6) NOT NULL,
  "usage_limit" INTEGER,
  "usage_count" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ride_promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ride_payments" (
  "id" SERIAL NOT NULL,
  "ride_id" INTEGER NOT NULL,
  "provider" VARCHAR(30) NOT NULL DEFAULT 'stripe',
  "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'MYR',
  "amount" DECIMAL(10,2) NOT NULL,
  "checkout_session_id" TEXT,
  "payment_intent_id" TEXT,
  "paid_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ride_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ride_notifications" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "ride_id" INTEGER,
  "type" VARCHAR(40) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "read_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ride_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_subscriptions" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ride_promo_codes_code_key" ON "ride_promo_codes"("code");
CREATE INDEX "idx_ride_promos_active_period" ON "ride_promo_codes"("active", "starts_at", "ends_at");
CREATE UNIQUE INDEX "ride_payments_checkout_session_id_key" ON "ride_payments"("checkout_session_id");
CREATE INDEX "idx_ride_payments_ride_status" ON "ride_payments"("ride_id", "status");
CREATE INDEX "idx_ride_notifications_user" ON "ride_notifications"("user_id", "read_at", "created_at" DESC);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "idx_push_subscriptions_user" ON "push_subscriptions"("user_id");

ALTER TABLE "rides" ADD CONSTRAINT "rides_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "ride_promo_codes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "ride_payments" ADD CONSTRAINT "ride_payments_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "ride_notifications" ADD CONSTRAINT "ride_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "ride_promo_codes" ADD CONSTRAINT "ride_promo_discount_type_check" CHECK ("discount_type" IN ('fixed', 'percent'));
ALTER TABLE "rides" ADD CONSTRAINT "rides_payment_method_check" CHECK ("payment_method" IN ('card', 'cash'));
ALTER TABLE "rides" ADD CONSTRAINT "rides_payment_status_check" CHECK ("payment_status" IN ('pending', 'processing', 'paid', 'failed', 'cash_due', 'cash_collected'));

UPDATE "ride_fare_rules" SET "cancellation_fee" = 2.00, "wait_per_minute_rate" = 0.20 WHERE "service_type" = 'bike';
UPDATE "ride_fare_rules" SET "cancellation_fee" = 3.00, "wait_per_minute_rate" = 0.35 WHERE "service_type" = 'car';
UPDATE "ride_fare_rules" SET "cancellation_fee" = 5.00, "wait_per_minute_rate" = 0.50 WHERE "service_type" = 'xl';

INSERT INTO "ride_promo_codes" ("code", "discount_type", "discount_value", "maximum_discount", "minimum_fare", "starts_at", "ends_at", "usage_limit")
VALUES ('ROADLYKL', 'percent', 10.00, 8.00, 10.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '90 days', 1000);
