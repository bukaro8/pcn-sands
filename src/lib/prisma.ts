import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  let databaseUrl: URL;
  try { databaseUrl = new URL(connectionString); }
  catch { throw new Error("DATABASE_URL is malformed"); }
  if (!["postgresql:", "postgres:"].includes(databaseUrl.protocol) || !databaseUrl.hostname || !databaseUrl.pathname || databaseUrl.pathname === "/") {
    throw new Error("DATABASE_URL must be a PostgreSQL URL with a host and database name");
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
