import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
  // Prisma can dispatch more than one operation on the connection used by a
  // transaction. Enable the pg protocol pipeline explicitly so this remains
  // supported when pg 9 removes its legacy internal query queue.
  pipeline: true,
});

export const prisma = new PrismaClient({ adapter });
