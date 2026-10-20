// Deliberate, reviewable vendoring. Neither application needs its sibling at runtime.
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const source = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(
  process.argv.slice(2).find((arg) => arg !== "--check") ??
    "../TikTools-app/src/universal",
);
const check = process.argv.includes("--check");
function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(join(dir, e.name), prefix + e.name + "/")
        : [prefix + e.name],
    )
    .filter(
      (f) =>
        !f.startsWith("tools/") &&
        !f.startsWith("tests/") &&
        f !== "vendor-lock.json",
    );
}
const hashes = {};
for (const file of files(source)) {
  const bytes = readFileSync(join(source, file));
  hashes[file] = createHash("sha256").update(bytes).digest("hex");
  if (check) {
    if (
      !existsSync(join(target, file)) ||
      !bytes.equals(readFileSync(join(target, file)))
    )
      throw new Error("VENDOR_DRIFT: " + file);
  } else {
    mkdirSync(resolve(target, file, ".."), { recursive: true });
    cpSync(join(source, file), join(target, file));
  }
}
if (!check)
  writeFileSync(
    join(target, "vendor-lock.json"),
    JSON.stringify(
      {
        version: "1.0.0",
        source: "obs-tiktok-widgets/web/universal",
        sha256: hashes,
      },
      null,
      2,
    ) + "\n",
  );
console.log(
  "Universal SDK " + (check ? "verified" : "vendored") + " at " + target,
);
