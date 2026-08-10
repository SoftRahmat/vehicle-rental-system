import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"];
const directUrl =
  process.env["DIRECT_URL"] ?? databaseUrl?.replace("-pooler.", ".");

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  typedSql: {
    path: "prisma/sql",
  },
  datasource: {
    url: directUrl,
  },
});
