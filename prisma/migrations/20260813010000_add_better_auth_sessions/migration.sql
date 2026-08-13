CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" TEXT,
  "user_agent" TEXT,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions"("token");
CREATE INDEX "idx_auth_sessions_user_id" ON "auth_sessions"("user_id");
CREATE INDEX "idx_auth_sessions_expires_at" ON "auth_sessions"("expires_at");

CREATE TABLE "auth_accounts" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMP(6),
  "refresh_token_expires_at" TIMESTAMP(6),
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "auth_accounts_provider_account_key" ON "auth_accounts"("provider_id", "account_id");
CREATE INDEX "idx_auth_accounts_user_id" ON "auth_accounts"("user_id");

CREATE TABLE "auth_verifications" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_auth_verifications_identifier" ON "auth_verifications"("identifier");

INSERT INTO "auth_accounts" ("id", "account_id", "provider_id", "user_id", "password")
SELECT 'credential-' || "id", "id"::text, 'credential', "id", "password"
FROM "users"
WHERE "password" IS NOT NULL
ON CONFLICT ("provider_id", "account_id") DO NOTHING;

INSERT INTO "auth_accounts" ("id", "account_id", "provider_id", "user_id")
SELECT 'google-' || "id", "google_subject", 'google', "id"
FROM "users"
WHERE "google_subject" IS NOT NULL
ON CONFLICT ("provider_id", "account_id") DO NOTHING;
