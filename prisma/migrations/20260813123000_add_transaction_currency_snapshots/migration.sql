ALTER TABLE "bookings"
ADD COLUMN "transaction_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN "display_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN "exchange_rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN "display_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "exchange_rate_source" VARCHAR(40) NOT NULL DEFAULT 'legacy_backfill',
ADD COLUMN "exchange_rate_captured_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "bookings" SET "display_total" = "total_price";

ALTER TABLE "rides"
ADD COLUMN "display_currency" VARCHAR(3) NOT NULL DEFAULT 'MYR',
ADD COLUMN "exchange_rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN "display_estimated_fare" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "exchange_rate_source" VARCHAR(40) NOT NULL DEFAULT 'legacy_backfill',
ADD COLUMN "exchange_rate_captured_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "rides" SET "display_estimated_fare" = "estimated_fare";

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_transaction_currency_check" CHECK ("transaction_currency" IN ('USD','MYR','EUR','GBP','SGD','AUD')),
ADD CONSTRAINT "bookings_display_currency_check" CHECK ("display_currency" IN ('USD','MYR','EUR','GBP','SGD','AUD')),
ADD CONSTRAINT "bookings_exchange_rate_check" CHECK ("exchange_rate" > 0);

ALTER TABLE "rides"
ADD CONSTRAINT "rides_display_currency_check" CHECK ("display_currency" IN ('USD','MYR','EUR','GBP','SGD','AUD')),
ADD CONSTRAINT "rides_exchange_rate_check" CHECK ("exchange_rate" > 0);
