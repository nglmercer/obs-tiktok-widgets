import { mkdirSync, copyFileSync, readdirSync } from "node:fs";
mkdirSync("data/web/playground", { recursive: true });
for (const name of readdirSync("web/playground"))
  if (/\.(html|css|js)$/.test(name))
    copyFileSync(`web/playground/${name}`, `data/web/playground/${name}`);
for (const name of ["widget.js", "widget.css"]) {
  copyFileSync(`web/widgets/${name}`, `data/web/widgets/${name}`);
  copyFileSync(`web/widgets/${name}`, `data/web/playground/${name}`);
}
