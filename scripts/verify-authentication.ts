import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";

import argon2 from "argon2";
import { AuthError, CredentialsSignin } from "next-auth";

import { prisma } from "../src/lib/prisma";
import { loginErrorMessage } from "../src/lib/login-errors";

function attemptKey(username: string, address: string) {
  return createHash("sha256").update(`username:${username}\u0000${address}`).digest("hex");
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
  const otherAddress = "203.0.113.77";
  const keys = [attemptKey(username, address), attemptKey(username, otherAddress), createHash("sha256").update(`ip:\u0000${address}`).digest("hex")];
  process.env.ADMIN_USERNAME = username;
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash("correct horse battery staple", { type: argon2.argon2id });
  process.env.AUTH_SECRET = randomBytes(32).toString("base64");
  process.env.CRON_SECRET = "cron-test-secret";

  try {
    const { verifyAdminCredentials } = await import("../src/lib/auth-security");
    const request = new Request("https://pcn.example.test/login", { headers: { "x-forwarded-for": address } });
    const valid = await verifyAdminCredentials({ username, password: "correct horse battery staple" }, request);
    if (valid?.id !== "administrator") throw new Error("Valid administrator login was rejected");
    await prisma.loginAttempt.create({ data: { key: keys[2], failureCount: 5, lockedUntil: new Date(Date.now() + 60_000) } });
    if (!(await verifyAdminCredentials({ username, password: "correct horse battery staple" }, request))) throw new Error("Legacy IP-only lock blocked a valid login");
    if (await verifyAdminCredentials({ username, password: "incorrect password" }, request)) throw new Error("Invalid password was accepted");
    for (let attempt = 0; attempt < 4; attempt += 1) await verifyAdminCredentials({ username, password: "incorrect password" }, request);
    if (await verifyAdminCredentials({ username, password: "correct horse battery staple" }, request)) throw new Error("Login rate limit did not lock further attempts");
    const otherClient = new Request("https://pcn.example.test/login", { headers: { "x-forwarded-for": `${otherAddress}, 192.0.2.10`, "x-real-ip": "192.0.2.10" } });
    if (!(await verifyAdminCredentials({ username, password: "correct horse battery staple" }, otherClient))) throw new Error("Shared proxy locked a different client");
    const noClient = new Request("https://pcn.example.test/login", { headers: { "x-real-ip": "192.0.2.10" } });
    for (let attempt = 0; attempt < 6; attempt += 1) await verifyAdminCredentials({ username, password: "incorrect password" }, noClient);
    if (!(await verifyAdminCredentials({ username, password: "correct horse battery staple" }, noClient))) throw new Error("Missing client address created a shared lockout");
    if (await prisma.loginAttempt.findUnique({ where: { key: attemptKey(username, "unknown") } })) throw new Error("Unknown client address was persisted");

    const diagnostics: string[] = [];
    const originalError = console.error;
    console.error = (message: unknown) => { diagnostics.push(String(message)); };
    try {
      process.env.ADMIN_PASSWORD_HASH = "malformed";
      await verifyAdminCredentials({ username, password: "correct horse battery staple" }, otherClient).then(() => { throw new Error("Malformed hash was accepted"); }, () => {});
      delete process.env.ADMIN_PASSWORD_HASH;
      await verifyAdminCredentials({ username, password: "correct horse battery staple" }, otherClient).then(() => { throw new Error("Missing hash was accepted"); }, () => {});
    } finally {
      console.error = originalError;
      process.env.ADMIN_PASSWORD_HASH = previous.passwordHash;
    }
    if (diagnostics.length !== 2 || diagnostics.some((line) => line.includes("correct horse") || line.includes("malformed"))) throw new Error("Safe configuration diagnostics were not produced");

    const originalFind = prisma.loginAttempt.findUnique;
    const originalErrorForDb = console.error;
    const databaseDiagnostics: string[] = [];
    console.error = (message: unknown) => { databaseDiagnostics.push(String(message)); };
    prisma.loginAttempt.findUnique = (() => { throw new Error("fictional connection failure"); }) as typeof originalFind;
    try {
      process.env.ADMIN_PASSWORD_HASH = await argon2.hash("correct horse battery staple", { type: argon2.argon2id });
      await verifyAdminCredentials({ username, password: "correct horse battery staple" }, otherClient).then(() => { throw new Error("Database failure was accepted as login"); }, () => {});
    } finally {
      prisma.loginAttempt.findUnique = originalFind;
      console.error = originalErrorForDb;
    }
    if (databaseDiagnostics.length !== 1 || !databaseDiagnostics[0].includes("database read failed") || databaseDiagnostics[0].includes("fictional connection")) throw new Error("Database failure diagnostic was unsafe or missing");
    if (loginErrorMessage(new CredentialsSignin()) !== "Invalid username or password.") throw new Error("Credential failure message changed");
    const serviceLogs: string[] = [];
    const originalServiceError = console.error;
    console.error = (message: unknown) => { serviceLogs.push(String(message)); };
    try {
      class TestServiceError extends AuthError { static type = "CallbackRouteError"; }
      if (loginErrorMessage(new TestServiceError()) !== "Sign-in is temporarily unavailable. Please try again later.") throw new Error("Service failure was reported as invalid credentials");
    } finally { console.error = originalServiceError; }
    if (serviceLogs.length !== 1 || !serviceLogs[0].includes("CallbackRouteError")) throw new Error("Service error was not logged safely");

    const { sessionMaxAgeSeconds } = await import("../src/auth");
    if (sessionMaxAgeSeconds !== 8 * 60 * 60) throw new Error("Unexpected session expiry");

    const { isAdministratorSession } = await import("../src/lib/require-admin");
    if (isAdministratorSession(null) || isAdministratorSession({ user: { id: "other" } }) || !isAdministratorSession({ user: { id: "administrator" } })) throw new Error("Administrator session guard failed");

    const weekly = await import("../src/app/api/jobs/weekly-report/route");
    const cronResponse = await weekly.POST(new Request("https://pcn.example.test/api/jobs/weekly-report", { method: "POST" }));
    if (cronResponse.status !== 401) throw new Error("Scheduled endpoint accepted a request without CRON_SECRET");
    console.log("Credential validation, client-scoped rate limiting, shared-proxy isolation and safe diagnostics successful");
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
