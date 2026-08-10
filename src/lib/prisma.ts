import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import config from "../config";

const adapter = new PrismaPg({
  connectionString: `${config.database_url}`,
});

export const prisma = new PrismaClient({ adapter });
