import {
  mkdtempSync,
  cpSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
const staging = mkdtempSync(join(tmpdir(), "widget-generated-"));
function files(root, base = root) {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(join(root, e.name), base)
        : [relative(base, join(root, e.name))],
    )
    .sort();
}
try {
  for (const file of [
    "web",
    "src/ui/i18n",
    "tools",
    "package.json",
    "tsconfig.json",
    "tsconfig.playground.json",
    "tsconfig.studio.json",
  ])
    cpSync(file, join(staging, file), { recursive: true });
  // Reuse the locked developer tool installation without fetching or changing sources.
  cpSync("node_modules", join(staging, "node_modules"), { recursive: true });
  const result = spawnSync("npm", ["run", "build"], {
    cwd: staging,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  const actual = files("data/web"),
    expected = files(join(staging, "data/web"));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      "Generated file list differs: extra=" +
        actual.filter((f) => !expected.includes(f)).join(",") +
        " missing=" +
        expected.filter((f) => !actual.includes(f)).join(","),
    );
  for (const file of actual)
    if (
      !readFileSync(join("data/web", file)).equals(
        readFileSync(join(staging, "data/web", file)),
      )
    )
      throw new Error(`Stale generated asset: ${file}`);
  console.log(`Verified ${actual.length} deterministic generated assets`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
