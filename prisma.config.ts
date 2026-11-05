import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Client generation and image builds do not need database access. At runtime,
    // migrate deploy will fail closed unless Coolify supplies a working URL.
    url: process.env.DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:5432/unused",
  },
});
