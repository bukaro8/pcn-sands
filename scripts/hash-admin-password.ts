import { stdin as input, stdout as output } from "node:process";

import argon2 from "argon2";

function readPassword(prompt: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) throw new Error("Run this command in an interactive terminal.");
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    const onData = (chunk: Buffer) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") { cleanup(); reject(new Error("Cancelled")); return; }
      if (key === "\r" || key === "\n") { cleanup(); output.write("\n"); resolve(value); return; }
      if (key === "\u007f") { value = value.slice(0, -1); return; }
      if (!key.startsWith("\u001b")) value += key;
    };
    const cleanup = () => { input.off("data", onData); input.setRawMode(Boolean(wasRaw)); input.pause(); };
    input.on("data", onData);
  });
}

async function main() {
  const password = await readPassword("New administrator password: ");
  const confirmation = await readPassword("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  if (password.length < 14) throw new Error("Use a password of at least 14 characters.");
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  output.write(`\nSet this value as ADMIN_PASSWORD_HASH (not the password):\n${hash}\n`);
}

main().catch((error: unknown) => { output.write(`${error instanceof Error ? error.message : "Unable to hash password."}\n`); process.exitCode = 1; });
