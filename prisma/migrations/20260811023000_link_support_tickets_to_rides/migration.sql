ALTER TABLE "support_tickets"
ADD COLUMN "ride_id" INTEGER;

CREATE INDEX "idx_support_tickets_ride"
ON "support_tickets"("ride_id");

ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_ride_id_fkey"
FOREIGN KEY ("ride_id") REFERENCES "rides"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;
