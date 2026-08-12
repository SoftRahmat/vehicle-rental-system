CREATE TABLE "driver_earnings" (
  "id" SERIAL PRIMARY KEY,
  "ride_id" INTEGER NOT NULL UNIQUE,
  "driver_id" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'MYR',
  "gross_fare" DECIMAL(10,2) NOT NULL,
  "commission_rate" DECIMAL(5,2) NOT NULL,
  "platform_commission" DECIMAL(10,2) NOT NULL,
  "toll_reimbursement" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "adjustment_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "net_earning" DECIMAL(10,2) NOT NULL,
  "settlement_method" VARCHAR(30) NOT NULL,
  "settlement_status" VARCHAR(30) NOT NULL,
  "earned_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_earnings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT,
  CONSTRAINT "driver_earnings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "driver_earnings_method_check" CHECK ("settlement_method" IN ('card_payout', 'cash_collected')),
  CONSTRAINT "driver_earnings_status_check" CHECK ("settlement_status" IN ('pending', 'processing', 'paid', 'cash_settled'))
);

CREATE TABLE "driver_payouts" (
  "id" SERIAL PRIMARY KEY,
  "reference" VARCHAR(30) NOT NULL UNIQUE,
  "driver_id" INTEGER NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'MYR',
  "gross_earnings" DECIMAL(10,2) NOT NULL,
  "commission_amount" DECIMAL(10,2) NOT NULL,
  "adjustment_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(10,2) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "payment_reference" VARCHAR(120),
  "approved_by_id" INTEGER,
  "approved_at" TIMESTAMP(6),
  "paid_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_payouts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "driver_payouts_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "driver_payouts_status_check" CHECK ("status" IN ('draft', 'approved', 'paid', 'failed'))
);

CREATE TABLE "driver_payout_items" (
  "id" SERIAL PRIMARY KEY,
  "payout_id" INTEGER NOT NULL,
  "earning_id" INTEGER NOT NULL UNIQUE,
  "amount" DECIMAL(10,2) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_payout_items_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "driver_payouts"("id") ON DELETE CASCADE,
  CONSTRAINT "driver_payout_items_earning_id_fkey" FOREIGN KEY ("earning_id") REFERENCES "driver_earnings"("id") ON DELETE RESTRICT
);

CREATE TABLE "driver_adjustments" (
  "id" SERIAL PRIMARY KEY,
  "driver_id" INTEGER NOT NULL,
  "earning_id" INTEGER,
  "payout_id" INTEGER,
  "amount" DECIMAL(10,2) NOT NULL,
  "reason" VARCHAR(240) NOT NULL,
  "created_by_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_adjustments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "driver_adjustments_earning_id_fkey" FOREIGN KEY ("earning_id") REFERENCES "driver_earnings"("id") ON DELETE RESTRICT,
  CONSTRAINT "driver_adjustments_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "driver_payouts"("id") ON DELETE SET NULL,
  CONSTRAINT "driver_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "idx_driver_earnings_settlement" ON "driver_earnings"("driver_id", "settlement_status", "earned_at" DESC);
CREATE INDEX "idx_driver_payouts_status" ON "driver_payouts"("driver_id", "status", "created_at" DESC);
CREATE INDEX "idx_driver_payout_items_payout" ON "driver_payout_items"("payout_id");
CREATE INDEX "idx_driver_adjustments_driver" ON "driver_adjustments"("driver_id", "created_at" DESC);

INSERT INTO "driver_earnings" (
  "ride_id", "driver_id", "currency", "gross_fare", "commission_rate",
  "platform_commission", "toll_reimbursement", "net_earning",
  "settlement_method", "settlement_status", "earned_at"
)
SELECT
  r."id", r."driver_id", r."currency", r."final_fare", 20,
  ROUND(GREATEST(r."final_fare" - r."toll_amount", 0) * 0.20, 2),
  r."toll_amount",
  ROUND(r."final_fare" - (GREATEST(r."final_fare" - r."toll_amount", 0) * 0.20), 2),
  CASE WHEN r."payment_method" = 'cash' THEN 'cash_collected' ELSE 'card_payout' END,
  CASE WHEN r."payment_method" = 'cash' THEN 'cash_settled' ELSE 'pending' END,
  COALESCE(r."completed_at", r."updated_at")
FROM "rides" r
WHERE r."status" = 'completed'
  AND r."driver_id" IS NOT NULL
  AND r."final_fare" IS NOT NULL
  AND (r."payment_status" = 'paid' OR r."payment_status" = 'cash_collected');
