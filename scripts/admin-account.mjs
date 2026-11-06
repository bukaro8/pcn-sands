import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";

import argon2 from "argon2";
import pg from "pg";

const { Client } = pg;

function configuration() {
  const username = process.env.ADMIN_USERNAME?.trim().toLocaleLowerCase("en-GB");
  const email = process.env.ADMIN_EMAIL?.trim().toLocaleLowerCase("en-GB");
  if (!username || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !process.env.DATABASE_URL) {
    throw new Error("Set ADMIN_USERNAME, ADMIN_EMAIL and DATABASE_URL before running this command.");
  }
  return { username, email };
}

function readPassword(prompt) {
  if (!input.isTTY || !output.isTTY) throw new Error("Run this command in an interactive terminal.");
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    const cleanup = () => { input.off("data", onData); input.setRawMode(Boolean(wasRaw)); input.pause(); };
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") { cleanup(); reject(new Error("Cancelled")); return; }
      if (key === "\r" || key === "\n") { cleanup(); output.write("\n"); resolve(value); return; }
      if (key === "\u007f") { value = value.slice(0, -1); return; }
      if (!key.startsWith("\u001b")) value += key;
    };
    input.on("data", onData);
  });
}

export async function saveAdministrator(client, mode, { username, email }, passwordHash) {
  if (mode !== "setup" && mode !== "reset") throw new Error("Unknown administrator operation.");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(1737561514)");
    const current = await client.query('SELECT id FROM "User" FOR UPDATE');
    if (mode === "setup") {
      if (current.rowCount) throw new Error("Administrator already exists. Use npm run admin:reset to change the password.");
      await client.query('INSERT INTO "User" (id, username, email, "passwordHash", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())', ["administrator", username, email, passwordHash, "ADMIN"]);
    } else {
      if (current.rowCount !== 1 || current.rows[0].id !== "administrator") throw new Error("Administrator account is missing or inconsistent. Reset was not applied.");
      await client.query('UPDATE "User" SET username = $1, email = $2, "passwordHash" = $3, "updatedAt" = NOW() WHERE id = $4', [username, email, passwordHash, "administrator"]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "setup" && mode !== "reset") throw new Error("Use npm run admin:setup or npm run admin:reset.");
  const identity = configuration();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const current = await client.query('SELECT id FROM "User" LIMIT 2');
    if (mode === "setup" && current.rowCount) throw new Error("Administrator already exists. Use npm run admin:reset to change the password.");
    if (mode === "reset" && current.rowCount !== 1) throw new Error("Exactly one administrator is required for reset.");
    const password = await readPassword("New administrator password: ");
    const confirmation = await readPassword("Confirm password: ");
    if (password !== confirmation) throw new Error("Passwords do not match.");
    if (password.length < 14) throw new Error("Use a password of at least 14 characters.");
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    await saveAdministrator(client, mode, identity, hash);
    output.write(mode === "setup" ? "Administrator created.\n" : "Administrator password reset.\n");
  } finally { await client.end().catch(() => {}); }
}

if (process.argv[1]?.endsWith("admin-account.mjs")) {
  main().catch((error) => {
    output.write(`${error instanceof Error && /^(Administrator|Exactly|Passwords|Use |Run |Set |Unknown)/.test(error.message) ? error.message : "Administrator operation failed. Check database connectivity, migration status and environment configuration."}\n`);
    process.exitCode = 1;
  });
}
