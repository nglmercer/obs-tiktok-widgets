import { mkdirSync, copyFileSync, readdirSync, cpSync } from "node:fs";
mkdirSync("data/web/playground", { recursive: true });
mkdirSync("data/web/widgets", { recursive: true });
for (const name of readdirSync("web/playground"))
  if (/\.(html|css|js)$/.test(name))
    copyFileSync(`web/playground/${name}`, `data/web/playground/${name}`);
for (const name of ["widget.css"]) {
  copyFileSync(`web/widgets/${name}`, `data/web/widgets/${name}`);
  copyFileSync(`web/widgets/${name}`, `data/web/playground/${name}`);
}

for (const item of readdirSync("web/widgets", {withFileTypes:true})) if(item.isDirectory()) cpSync(`web/widgets/${item.name}`, `data/web/widgets/${item.name}`, {recursive:true});
cpSync("web/examples", "data/web/examples", {recursive:true});
for (const name of readdirSync("web/sdk")) if(name.endsWith(".ts")) copyFileSync(`web/sdk/${name}`, `data/web/sdk/${name}`);
