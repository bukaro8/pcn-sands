export type AppealUrlValidation = { ok: true; url: string } | { ok: false; error: string };

function unsafeIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19));
}

function unsafeHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  if (unsafeIpv4(hostname)) return true;
  if (hostname.includes(":")) {
    const compact = hostname.replace(/^0+/, "");
    return compact === "::" || compact === "::1" || /^(?:fc|fd|fe8|fe9|fea|feb)/.test(compact) || compact.startsWith("::ffff:");
  }
  return !hostname.includes(".");
}

export function validateAppealUrl(input: string): AppealUrlValidation {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter the official appeal URL." };
  if (raw.length > 2048) return { ok: false, error: "The appeal URL is too long." };
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { return { ok: false, error: "Enter a complete HTTPS URL." }; }
  if (parsed.protocol !== "https:") return { ok: false, error: "The appeal URL must use HTTPS." };
  if (parsed.username || parsed.password) return { ok: false, error: "The appeal URL must not contain embedded credentials." };
  if (unsafeHostname(parsed.hostname)) return { ok: false, error: "Use a public official appeal website, not a local or private address." };
  return { ok: true, url: parsed.href };
}
