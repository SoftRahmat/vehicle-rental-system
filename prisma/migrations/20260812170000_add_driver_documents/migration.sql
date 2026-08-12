CREATE TABLE "driver_documents" (
  "id" SERIAL PRIMARY KEY,
  "driver_id" INTEGER NOT NULL,
  "type" VARCHAR(30) NOT NULL,
  "document_number" VARCHAR(100),
  "document_url" VARCHAR(500) NOT NULL,
  "issued_at" DATE,
  "expires_at" DATE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "rejection_reason" VARCHAR(500),
  "reviewed_by_id" INTEGER,
  "reviewed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "driver_documents_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "driver_documents_type_check" CHECK ("type" IN ('driving_licence', 'vehicle_insurance', 'road_tax', 'vehicle_permit')),
  CONSTRAINT "driver_documents_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
CREATE UNIQUE INDEX "driver_documents_driver_type_key" ON "driver_documents"("driver_id", "type");
CREATE INDEX "idx_driver_documents_review_expiry" ON "driver_documents"("status", "expires_at");
