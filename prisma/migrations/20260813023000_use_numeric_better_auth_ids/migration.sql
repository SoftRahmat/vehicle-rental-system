-- Better Auth numeric-ID mode converts relation values such as User.id before
-- Prisma queries. Its own record IDs must therefore also be database-generated.
ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_pkey";
ALTER TABLE "auth_sessions" ADD COLUMN "numeric_id" SERIAL;
ALTER TABLE "auth_sessions" DROP COLUMN "id";
ALTER TABLE "auth_sessions" RENAME COLUMN "numeric_id" TO "id";
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE "auth_accounts" DROP CONSTRAINT "auth_accounts_pkey";
ALTER TABLE "auth_accounts" ADD COLUMN "numeric_id" SERIAL;
ALTER TABLE "auth_accounts" DROP COLUMN "id";
ALTER TABLE "auth_accounts" RENAME COLUMN "numeric_id" TO "id";
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id");

ALTER TABLE "auth_verifications" DROP CONSTRAINT "auth_verifications_pkey";
ALTER TABLE "auth_verifications" ADD COLUMN "numeric_id" SERIAL;
ALTER TABLE "auth_verifications" DROP COLUMN "id";
ALTER TABLE "auth_verifications" RENAME COLUMN "numeric_id" TO "id";
ALTER TABLE "auth_verifications" ADD CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id");
