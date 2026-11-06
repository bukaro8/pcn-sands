import "dotenv/config";
import { randomBytes } from "node:crypto";

import argon2 from "argon2";
import { AuthError, CredentialsSignin } from "next-auth";
import pg from "pg";

import { classifyDatabaseError } from "../src/lib/database-errors";
import { loginErrorMessage } from "../src/lib/login-errors";
import { prisma } from "../src/lib/prisma";

const password = "fictional administrator test password";

async function main() {
  const previous = { username: process.env.ADMIN_USERNAME, authSecret: process.env.AUTH_SECRET };
  const username = `auth-test-${Date.now()}`;
  const email = `${username}@example.test`;
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const originalFind = prisma.user.findUnique;
  try {
    await client.connect();
    await client.query('CREATE TEMP TABLE "User" (LIKE public."User" INCLUDING ALL)');
    const { saveAdministrator } = await import("./admin-account.mjs");
    await saveAdministrator(client, "setup", { username, email }, hash);
    await client.query('INSERT INTO "User" (id, username, email, "passwordHash", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())', ["second", "another-admin", "another@example.test", hash, "ADMIN"]).then(
      () => { throw new Error("A second administrator was accepted"); },
      () => {},
    );
    await saveAdministrator(client, "setup", { username, email }, hash).then(() => { throw new Error("Setup overwrote an existing administrator"); }, () => {});
    const replacement = await argon2.hash(`${password} reset`, { type: argon2.argon2id });
    await saveAdministrator(client, "reset", { username, email }, replacement);
    const row = await client.query('SELECT "passwordHash" FROM "User" WHERE id = $1', ["administrator"]);
    if (!await argon2.verify(row.rows[0].passwordHash, `${password} reset`) || await argon2.verify(row.rows[0].passwordHash, password)) throw new Error("Password reset did not replace the hash");
    await saveAdministrator(client, "reset", { username, email }, hash);

    process.env.ADMIN_USERNAME = username;
    process.env.AUTH_SECRET = randomBytes(32).toString("base64");
    prisma.user.findUnique = (async () => ({ id: "administrator", username, email, passwordHash: hash, role: "ADMIN", createdAt: new Date(), updatedAt: new Date() })) as typeof originalFind;
    const { verifyAdminCredentials, loginRateLimit } = await import("../src/lib/auth-security");
    const first = new Request("https://pcn.example.test/login", { headers: { "cf-connecting-ip": "198.51.100.42", "x-forwarded-for": "192.0.2.10" } });
    const second = new Request("https://pcn.example.test/login", { headers: { "cf-connecting-ip": "203.0.113.77", "x-forwarded-for": "192.0.2.10" } });
    const correct = { username, password };
    if ((await verifyAdminCredentials(correct, first))?.id !== "administrator") throw new Error("Correct password was rejected");
    if (await verifyAdminCredentials({ username, password: "incorrect" }, first)) throw new Error("Incorrect password was accepted");
    for (let i = 0; i < loginRateLimit.maxFailures; i++) await verifyAdminCredentials({ username, password: "incorrect" }, first);
    if ((await verifyAdminCredentials(correct, second))?.id !== "administrator") throw new Error("Shared proxy blocked another client");
    if ((await verifyAdminCredentials(correct, first))?.id !== "administrator") throw new Error("Failed attempts blocked correct credentials");
    const unknown = new Request("https://pcn.example.test/login", { headers: { "x-forwarded-for": "invalid" } });
    for (let i = 0; i < loginRateLimit.maxFailures + 1; i++) await verifyAdminCredentials({ username, password: "incorrect" }, unknown);
    if ((await verifyAdminCredentials(correct, unknown))?.id !== "administrator") throw new Error("Unknown client address created a shared lockout");

    const originalSecret = process.env.AUTH_SECRET;
    const configLogs: string[] = [];
    const priorConsoleError = console.error;
    console.error = (message: unknown) => { configLogs.push(String(message)); };
    delete process.env.AUTH_SECRET;
    try {
      await verifyAdminCredentials(correct, first).then(() => { throw new Error("Missing AUTH_SECRET was accepted"); }, () => {});
    } finally { process.env.AUTH_SECRET = originalSecret; console.error = priorConsoleError; }
    if (configLogs.length !== 1 || !configLogs[0].includes("AUTH_SECRET") || configLogs[0].includes(password)) throw new Error("Configuration diagnostic was missing or unsafe");

    const logs: string[] = [];
    const originalError = console.error;
    console.error = (message: unknown) => { logs.push(String(message)); };
    prisma.user.findUnique = (() => { throw { code: "P1001" }; }) as typeof originalFind;
    try {
      await verifyAdminCredentials(correct, first).then(() => { throw new Error("Database outage was accepted as login"); }, (error: unknown) => {
        if (!(error instanceof Error) || !error.message.includes("unavailable")) throw new Error("Database outage was misclassified");
      });
    } finally {
      prisma.user.findUnique = (async () => ({ id: "administrator", username, email, passwordHash: hash, role: "ADMIN", createdAt: new Date(), updatedAt: new Date() })) as typeof originalFind;
      console.error = originalError;
    }
    if (logs.length !== 1 || !logs[0].includes("database unavailable") || logs[0].includes(password)) throw new Error("Database diagnostic was missing or unsafe");

    for (const [code, kind] of [["P1000", "configuration"], ["P1001", "unavailable"], ["P2021", "migrations"], ["P2009", "query"]] as const) {
      if (classifyDatabaseError({ code }).kind !== kind) throw new Error(`Database classification failed for ${code}`);
    }
    if (classifyDatabaseError(new Error("unknown")).kind !== "internal") throw new Error("Internal error classification failed");
    if (loginErrorMessage(new CredentialsSignin()) !== "Invalid username or password.") throw new Error("Credential failure message changed");
    const serviceLogs: string[] = [];
    console.error = (message: unknown) => { serviceLogs.push(String(message)); };
    try {
      class TestServiceError extends AuthError { static type = "CallbackRouteError"; }
      if (loginErrorMessage(new TestServiceError()) !== "Sign-in is temporarily unavailable. Please try again later.") throw new Error("Service failure was reported as bad credentials");
    } finally { console.error = originalError; }
    if (serviceLogs.length !== 1) throw new Error("Auth service failure was not logged");

    const { sessionMaxAgeSeconds } = await import("../src/auth");
    if (sessionMaxAgeSeconds !== 8 * 60 * 60) throw new Error("Unexpected session expiry");
    const { encode, decode } = await import("next-auth/jwt");
    const salt = "authjs.session-token";
    const sessionToken = await encode({ token: { sub: "administrator" }, secret: process.env.AUTH_SECRET!, salt, maxAge: sessionMaxAgeSeconds });
    if ((await decode({ token: sessionToken, secret: process.env.AUTH_SECRET!, salt }))?.sub !== "administrator") throw new Error("Session token did not survive a second decode");
    const expired = await encode({ token: { sub: "administrator" }, secret: process.env.AUTH_SECRET!, salt, maxAge: -60 });
    let expiredRejected = false;
    try { expiredRejected = !await decode({ token: expired, secret: process.env.AUTH_SECRET!, salt }); }
    catch { expiredRejected = true; }
    if (!expiredRejected) throw new Error("Expired session token remained valid");
    const { isAdministratorSession } = await import("../src/lib/require-admin");
    if (isAdministratorSession(null) || isAdministratorSession({ user: { id: "other" } }) || !isAdministratorSession({ user: { id: "administrator" } })) throw new Error("Session guard failed");
    console.log("Administrator setup/reset, login, rate limit isolation, database diagnostics and session guard passed");
  } finally {
    prisma.user.findUnique = originalFind;
    await client.end().catch(() => {});
    process.env.ADMIN_USERNAME = previous.username;
    process.env.AUTH_SECRET = previous.authSecret;
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Authentication test failed"); process.exitCode = 1; });
