import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Database connection successful");
}

main()
  .catch((error: unknown) => {
    console.error("Database connection failed");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
