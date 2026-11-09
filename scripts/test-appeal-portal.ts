import { validateAppealUrl } from "../src/lib/appeal-url";

function expectValid(input: string, expected: string) {
  const result = validateAppealUrl(input);
  if (!result.ok || result.url !== expected) throw new Error(`Expected a valid appeal URL for ${input}`);
}

function expectInvalid(input: string) {
  const result = validateAppealUrl(input);
  if (result.ok) throw new Error(`Expected an unsafe appeal URL to be rejected: ${input}`);
}

expectValid("https://appeals.example.gov.uk/challenge", "https://appeals.example.gov.uk/challenge");
expectValid(" https://tfl.gov.uk/modes/driving/challenge-a-pcn ", "https://tfl.gov.uk/modes/driving/challenge-a-pcn");
expectValid("https://appeals.private-parking.example/", "https://appeals.private-parking.example/");

[
  "",
  "not a URL",
  "http://appeals.example.gov.uk",
  "javascript:alert(1)",
  "https://localhost/appeal",
  "https://portal.local/appeal",
  "https://127.0.0.1/appeal",
  "https://10.0.0.4/appeal",
  "https://172.16.1.2/appeal",
  "https://192.168.1.2/appeal",
  "https://[::1]/appeal",
  "https://admin:password@appeals.example.gov.uk/appeal",
].forEach(expectInvalid);

console.log("Appeal portal URL validation passed");
