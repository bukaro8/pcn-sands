import { createHash } from "node:crypto";
import { isIP } from "node:net";

import argon2 from "argon2";

import { prisma } from "@/lib/prisma";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function configuredUsername() {
  return process.env.ADMIN_USERNAME?.trim().toLocaleLowerCase("en-GB") ?? "";
}

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  // Coolify's trusted reverse proxy must set X-Forwarded-For to the client IP.
  // X-Real-IP may identify the proxy itself, so it is not a safe lockout key.
  return forwarded && isIP(forwarded) ? forwarded : null;
}

function loginKey(username: string, address: string) {
  return createHash("sha256").update(`username:${username}\u0000${address}`).digest("hex");
}

function validCredentials(credentials: unknown): credentials is { username: string; password: string } {
  if (!credentials || typeof credentials !== "object") return false;
  const candidate = credentials as Record<string, unknown>;
  return typeof candidate.username === "string" && typeof candidate.password === "string" && candidate.username.length <= 160 && candidate.password.length <= 512;
}

async function recordFailure(key: string, now: Date) {
  const existing = await prisma.loginAttempt.findUnique({ where: { key } });
  if (!existing || now.getTime() - existing.windowStarted.getTime() >= WINDOW_MS) {
    await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, failureCount: 1, windowStarted: now },
      update: { failureCount: 1, windowStarted: now, lockedUntil: null },
    });
    return;
  }

  const failureCount = existing.failureCount + 1;
  await prisma.loginAttempt.update({
    where: { key },
    data: { failureCount, lockedUntil: failureCount >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null },
  });
}

/** Validates credentials without exposing whether the username, password, or rate limit caused rejection. */
export async function verifyAdminCredentials(credentials: unknown, request: Request) {
  if (!validCredentials(credentials)) return null;
  const username = credentials.username.trim().toLocaleLowerCase("en-GB");
  const address = clientAddress(request);
  const key = address ? loginKey(username, address) : null;
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  const expectedUsername = configuredUsername();
  if (!expectedUsername || !configuredHash) {
    console.error("Administrator login unavailable: ADMIN_USERNAME or ADMIN_PASSWORD_HASH is missing.");
    return null;
  }
  if (!/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/.test(configuredHash)) {
    console.error("Administrator login unavailable: ADMIN_PASSWORD_HASH is not a valid Argon2id encoded hash.");
    return null;
  }
  const now = new Date();
  const attempt = key ? await prisma.loginAttempt.findUnique({ where: { key } }) : null;
  if (attempt?.lockedUntil && attempt.lockedUntil > now) return null;
  let passwordMatches = false;
  try {
    // Always perform the configured hash verification when available to reduce
    // timing differences between an unknown username and a wrong password.
    passwordMatches = await argon2.verify(configuredHash, credentials.password);
  } catch {
    console.error("Administrator login unavailable: ADMIN_PASSWORD_HASH verification failed.");
    return null;
  }

  if (username !== expectedUsername || !passwordMatches) {
    if (key && username === expectedUsername) await recordFailure(key, now);
    return null;
  }

  if (key) await prisma.loginAttempt.deleteMany({ where: { key } });
  return { id: "administrator", name: process.env.ADMIN_USERNAME?.trim() || "Administrator" };
}

export const loginRateLimit = { maxFailures: MAX_FAILURES, windowMs: WINDOW_MS };
