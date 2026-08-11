CREATE TABLE "driver_ride_rejections" (
  "id" SERIAL NOT NULL,
  "ride_id" INTEGER NOT NULL,
  "driver_id" INTEGER NOT NULL,
  "reason" VARCHAR(30) NOT NULL,
  "details" VARCHAR(240),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_ride_rejections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_ride_rejections_reason_check"
    CHECK ("reason" IN ('not_available', 'too_far', 'other')),
  CONSTRAINT "driver_ride_rejections_ride_id_fkey"
    FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "driver_ride_rejections_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "idx_driver_ride_rejections_ride"
  ON "driver_ride_rejections"("ride_id", "created_at" DESC);

CREATE INDEX "idx_driver_ride_rejections_analysis"
  ON "driver_ride_rejections"("driver_id", "reason", "created_at" DESC);
