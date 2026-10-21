#!/usr/bin/env node
// Explicit local administration. OBS must be stopped before updating settings.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
const [command, path, producer = "cli", credentialPath] = process.argv.slice(2);
if (
  !["pair", "revoke", "rotate"].includes(command) ||
  !path ||
  (!credentialPath && command !== "revoke")
)
  throw Error(
    "Usage: pair.mjs pair|rotate|revoke /plugin/config/settings.json producer [private-credential-output]",
  );
if (!/^[a-z][a-z0-9_-]{0,60}$/.test(producer))
  throw Error("Invalid producer name");
const settings = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
settings.externalEvents ??= {
  enabled: false,
  bind: "127.0.0.1",
  port: 17453,
  producers: [],
};
const config = settings.externalEvents;
config.producers ??= [];
if (command === "revoke") {
  for (const item of config.producers)
    if (item.source === "external." + producer) item.revoked = true;
} else {
  const token = randomBytes(32).toString("hex");
  // Never print or overwrite a credential. Give it an OS-protected destination.
  writeFileSync(resolve(credentialPath), token + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  for (const item of config.producers)
    if (item.source === "external." + producer) item.revoked = true;
  config.producers.push({
    source: "external." + producer,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    scopes: ["read", "publish"],
    types: ["custom.alert"],
    rateLimit: 60,
    expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    revoked: false,
  });
}
const output = JSON.stringify(settings, null, 2) + "\n";
writeFileSync(path + ".universal.tmp", output, { mode: 0o600 });
renameSync(path + ".universal.tmp", path);
console.log(
  "Producer " +
    command +
    " complete. Review externalEvents permissions, enable explicitly and restart OBS. Credentials were not printed.",
);
