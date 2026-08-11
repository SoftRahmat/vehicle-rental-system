ALTER TABLE "rides"
ADD COLUMN "wait_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cash_collected_at" TIMESTAMP(6);

ALTER TABLE "rides"
ADD CONSTRAINT "rides_wait_minutes_check"
CHECK ("wait_minutes" >= 0);
