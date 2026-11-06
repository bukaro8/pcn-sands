import type pg from "pg";

export declare function saveAdministrator(
  client: pg.Client,
  mode: "setup" | "reset",
  identity: { username: string; email: string },
  passwordHash: string,
): Promise<void>;
