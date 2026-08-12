CREATE TABLE "ride_reviews" (
  "id" SERIAL PRIMARY KEY,
  "ride_id" INTEGER NOT NULL UNIQUE,
  "passenger_id" INTEGER NOT NULL,
  "driver_id" INTEGER NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" VARCHAR(1000),
  "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "moderation_status" VARCHAR(30) NOT NULL DEFAULT 'visible',
  "flag_reason" VARCHAR(120),
  "moderation_note" VARCHAR(1000),
  "moderated_by_id" INTEGER,
  "moderated_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ride_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "ride_reviews_moderation_status_check" CHECK ("moderation_status" IN ('visible', 'under_review', 'hidden', 'resolved')),
  CONSTRAINT "ride_reviews_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE,
  CONSTRAINT "ride_reviews_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "ride_reviews_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "ride_reviews_moderated_by_id_fkey" FOREIGN KEY ("moderated_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_ride_reviews_driver" ON "ride_reviews"("driver_id", "created_at" DESC);
CREATE INDEX "idx_ride_reviews_moderation" ON "ride_reviews"("moderation_status", "created_at" DESC);
