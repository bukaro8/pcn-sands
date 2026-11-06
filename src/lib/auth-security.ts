import { isIP } from "node:net";

import argon2 from "argon2";

import { classifyDatabaseError, logDatabaseError } from "@/lib/database-errors";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; started: number }>();

function clientAddress(request: Request) {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare && isIP(cloudflare)) return cloudflare;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && isIP(forwarded) ? forwarded : null;
}

function validCredentials(credentials: unknown): credentials is { username: string; password: string } {
  if (!credentials || typeof credentials !== "object") return false;
  const candidate = credentials as Record<string, unknown>;
  return typeof candidate.username === "string" && typeof candidate.password === "string" && candidate.username.length <= 160 && candidate.password.length <= 512;
}

function failureKey(username: string, request: Request) {
  const address = clientAddress(request);
  return address ? `${username}\u0000${address}` : null;
}

function isLimited(key: string | null, now: number) {
  if (!key) return false;
  const state = failures.get(key);
  if (!state) return false;
  if (now - state.started >= WINDOW_MS) { failures.delete(key); return false; }
  return state.count >= MAX_FAILURES;
}

function recordFailure(key: string | null, now: number) {
  if (!key) return;
  // This is a bounded process-local abuse guard, never an account lockout.
  if (failures.size > 1000) failures.clear();
  const state = failures.get(key);
  failures.set(key, state && now - state.started < WINDOW_MS
    ? { count: state.count + 1, started: state.started }
    : { count: 1, started: now });
}

/** Correct credentials are never denied because another client failed. */
export async function verifyAdminCredentials(credentials: unknown, request: Request) {
  if (!validCredentials(credentials)) return null;
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    console.error("Administrator login unavailable: AUTH_SECRET is missing or too short.");
    throw new Error("Authentication configuration unavailable");
  }
  const expectedUsername = process.env.ADMIN_USERNAME?.trim().toLocaleLowerCase("en-GB");
  if (!expectedUsername) {
    console.error("Administrator login unavailable: ADMIN_USERNAME is missing.");
    throw new Error("Authentication configuration unavailable");
  }
  const username = credentials.username.trim().toLocaleLowerCase("en-GB");
  const key = failureKey(expectedUsername, request);
  let user;
  try {
    const { prisma } = await import("@/lib/prisma");
    user = await prisma.user.findUnique({ where: { username: expectedUsername } });
  } catch (error) {
    logDatabaseError("Administrator login", error);
    throw new Error(`Authentication database ${classifyDatabaseError(error).kind}`);
  }
  if (!user || user.role !== "ADMIN") {
    console.error("Administrator login unavailable: administrator setup is incomplete.");
    throw new Error("Administrator account unavailable");
  }
  if (!/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[^$]+\$[^$]+$/.test(user.passwordHash)) {
    console.error("Administrator login unavailable: stored password hash is invalid.");
    throw new Error("Administrator account configuration unavailable");
  }
  let matches = false;
  try { matches = await argon2.verify(user.passwordHash, credentials.password); }
  catch {
    console.error("Administrator login unavailable: password verification failed.");
    throw new Error("Administrator account configuration unavailable");
  }
  if (username === expectedUsername && matches) {
    if (key) failures.delete(key);
    return { id: "administrator", name: user.username };
  }
  const now = Date.now();
  if (isLimited(key, now)) await new Promise((resolve) => setTimeout(resolve, 750));
  else recordFailure(key, now);
  return null;
}

export const loginRateLimit = { maxFailures: MAX_FAILURES, windowMs: WINDOW_MS };
