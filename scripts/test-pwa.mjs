import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifestSource = await readFile(new URL("../src/app/manifest.ts", import.meta.url), "utf8");
for (const required of [
  'name: "Sands PCN Management"',
  'start_url: "/"',
  'scope: "/"',
  'display: "standalone"',
  'purpose: "maskable"',
]) assert.ok(manifestSource.includes(required), `Manifest is missing ${required}`);

for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512]]) {
  const image = await readFile(new URL(`../public/icons/${file}`, import.meta.url));
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG", `${file} is not a PNG`);
  assert.equal(image.readUInt32BE(16), size, `${file} has the wrong width`);
  assert.equal(image.readUInt32BE(20), size, `${file} has the wrong height`);
}

const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
assert.match(serviceWorker, /addEventListener\("install"/);
assert.match(serviceWorker, /addEventListener\("activate"/);
assert.match(serviceWorker, /addEventListener\("fetch"/);
assert.match(serviceWorker, /respondWith\(fetch\(event\.request\)\)/);
assert.doesNotMatch(serviceWorker, /caches\.|CacheStorage|indexedDB|localStorage/);

console.log("PWA manifest, icons and network-only service worker verified");
