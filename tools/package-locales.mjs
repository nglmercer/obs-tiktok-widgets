import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function nativeCatalog(locale) {
  const catalog = JSON.parse(
    fs.readFileSync(`web/shared/i18n/${locale}.json`, "utf8"),
  );
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n<TS version="2.1" language="${locale}">\n  <context>\n    <name>TikTokWidgets</name>\n` +
    Object.keys(catalog)
      .sort()
      .map(
        (key) =>
          `    <message>\n      <source>${escape(key)}</source>\n      <translation>${escape(catalog[key])}</translation>\n    </message>\n`,
      )
      .join("") +
    "  </context>\n</TS>\n"
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  for (const locale of ["en", "es"]) {
    const source = `src/ui/i18n/${locale}.ts`;
    fs.writeFileSync(source, nativeCatalog(locale));
    if (process.argv.includes("--compile")) {
      const tools = [
        process.env.LRELEASE,
        "lrelease",
        "/usr/lib/qt6/bin/lrelease",
      ].filter(Boolean);
      let result;
      for (const tool of tools) {
        result = spawnSync(tool, [source, "-qm", `src/ui/i18n/${locale}.qm`], {
          encoding: "utf8",
        });
        if (!result.error) break;
      }
      if (result.error || result.status !== 0)
        throw new Error(
          "Qt lrelease is required for native translation development; set LRELEASE to its path.",
        );
      process.stdout.write(result.stdout);
    }
  }
}
