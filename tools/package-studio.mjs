import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Icons from "lucide-react";
mkdirSync("data/web/builder", { recursive: true });
for (const f of ["package.json", "package-lock.json", "runner.mjs"])
  copyFileSync("web/builder/" + f, "data/web/builder/" + f);
writeFileSync(
  "data/web/builder/sdk.ts",
  readFileSync("web/sdk/types.ts", "utf8") +
    "\n" +
    readFileSync("web/sdk/events.ts", "utf8").replace(/import type[^;]+;/, ""),
);
writeFileSync(
  "data/web/builder/react-sdk.ts",
  readFileSync("web/sdk/react.ts", "utf8")
    .replace("'./events.js'", "'@obs-tiktok/widgets-sdk'")
    .replace("'./types.js'", "'@obs-tiktok/widgets-sdk'"),
);
const actions = JSON.parse(readFileSync("web/shared/actions.json", "utf8"));
mkdirSync("data/web/icons", { recursive: true });
for (const a of actions)
  writeFileSync(
    "data/web/icons/" + a.id + ".svg",
    renderToStaticMarkup(
      React.createElement(Icons[a.icon], { color: "#bdcde6", size: 24 }),
    ),
  );
copyFileSync("web/shared/actions.json", "data/web/icons/actions.json");
