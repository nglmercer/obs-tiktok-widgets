import { build } from "esbuild";
import {
  mkdirSync,
  copyFileSync,
  readdirSync,
  cpSync,
  existsSync,
} from "node:fs";
// Package developer template sources without modifying any source file.
for (const id of readdirSync("web/templates", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)) {
  // Framework starters are repository development fixtures, not installed user templates.
  if (["builtin.typescript-vanilla", "builtin.react-typescript"].includes(id))
    continue;
  for (const version of readdirSync(`web/templates/${id}`)) {
    const source = `web/templates/${id}/${version}`,
      output = `data/web/templates/${id}/${version}`;
    mkdirSync(`${output}/src`, { recursive: true });
    if (existsSync(`${source}/assets`))
      cpSync(`${source}/assets`, `${output}/assets`, { recursive: true });
    for (const p of ["manifest.json", "schema", "presets"])
      cpSync(`${source}/${p}`, `${output}/${p}`, { recursive: true });
    if (!existsSync(`${source}/src/main.js`)) {
      cpSync(`${source}/src`, `${output}/src`, { recursive: true });
      continue;
    }
    for (const file of ["index.html", "style.css"])
      copyFileSync(`${source}/src/${file}`, `${output}/src/${file}`);
    await build({
      entryPoints: [`${source}/src/main.js`],
      bundle: true,
      format: "iife",
      outfile: `${output}/src/main.js`,
    });
  }
}
await build({
  entryPoints: ["web/widgets/widget.js"],
  bundle: true,
  format: "iife",
  outfile: "data/web/widgets/widget.js",
});
copyFileSync("data/web/widgets/widget.js", "data/web/playground/widget.js");

await build({
  entryPoints: ["web/runtime/health-bootstrap.js"],
  bundle: true,
  format: "iife",
  outfile: "data/web/health-client.js",
});
