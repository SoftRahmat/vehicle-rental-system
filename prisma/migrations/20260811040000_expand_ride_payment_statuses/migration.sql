ALTER TABLE "rides"
DROP CONSTRAINT IF EXISTS "rides_payment_status_check";

ALTER TABLE "rides"
ADD CONSTRAINT "rides_payment_status_check"
CHECK (
  "payment_status" IN (
    'pending',
    'processing',
    'paid',
    'failed',
    'cash_due',
    'cash_collected',
    'authorization_required',
    'authorization_processing',
    'authorization_failed',
    'authorized',
    'capture_pending',
    'payment_failed',
    'not_due'
  )
);
