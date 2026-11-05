import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";

import argon2 from "argon2";

import { prisma } from "../src/lib/prisma";

function attemptKey(scope: "username" | "ip", value: string, address: string) {
  return createHash("sha256").update(`${scope}:${value}\u0000${address}`).digest("hex");
}

async function main() {
  const previous = {
    username: process.env.ADMIN_USERNAME,
    passwordHash: process.env.ADMIN_PASSWORD_HASH,
    authSecret: process.env.AUTH_SECRET,
    cronSecret: process.env.CRON_SECRET,
  };
  const username = `auth-test-${Date.now()}`;
  const address = "198.51.100.42";
  const keys = [attemptKey("username", username, address), attemptKey("ip", "", address)];
  process.env.ADMIN_USERNAME = username;
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash("correct horse battery staple", { type: argon2.argon2id });
  process.env.AUTH_SECRET = randomBytes(32).toString("base64");
  process.env.CRON_SECRET = "cron-test-secret";

  try {
    const { verifyAdminCredentials } = await import("../src/lib/auth-security");
    const request = new Request("https://pcn.example.test/login", { headers: { "x-forwarded-for": address } });
    const valid = await verifyAdminCredentials({ username, password: "correct horse battery staple" }, request);
    if (valid?.id !== "administrator") throw new Error("Valid administrator login was rejected");
    if (await verifyAdminCredentials({ username, password: "incorrect password" }, request)) throw new Error("Invalid password was accepted");
    for (let attempt = 0; attempt < 4; attempt += 1) await verifyAdminCredentials({ username, password: "incorrect password" }, request);
    if (await verifyAdminCredentials({ username, password: "correct horse battery staple" }, request)) throw new Error("Login rate limit did not lock further attempts");

    const { sessionMaxAgeSeconds } = await import("../src/auth");
    if (sessionMaxAgeSeconds !== 8 * 60 * 60) throw new Error("Unexpected session expiry");

    const { isAdministratorSession } = await import("../src/lib/require-admin");
    if (isAdministratorSession(null) || isAdministratorSession({ user: { id: "other" } }) || !isAdministratorSession({ user: { id: "administrator" } })) throw new Error("Administrator session guard failed");

    const weekly = await import("../src/app/api/jobs/weekly-report/route");
    const cronResponse = await weekly.POST(new Request("https://pcn.example.test/api/jobs/weekly-report", { method: "POST" }));
    if (cronResponse.status !== 401) throw new Error("Scheduled endpoint accepted a request without CRON_SECRET");
    console.log("Credential validation, rate limiting, session expiry and protected-route checks successful");
  } finally {
    await prisma.loginAttempt.deleteMany({ where: { key: { in: keys } } });
    process.env.ADMIN_USERNAME = previous.username;
    process.env.ADMIN_PASSWORD_HASH = previous.passwordHash;
    process.env.AUTH_SECRET = previous.authSecret;
    process.env.CRON_SECRET = previous.cronSecret;
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
