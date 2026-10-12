import Ajv from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
const ajv = new Ajv({ strict: false, code: { source: true, esm: true } }),
  schemas = {},
  exports = {};
let count = 0;
for (const id of readdirSync("web/templates", { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name))
  for (const version of readdirSync("web/templates/" + id)) {
    const root = "web/templates/" + id + "/" + version;
    const manifest = JSON.parse(readFileSync(root + "/manifest.json"));
    if (!manifest.configSchema) continue;
    const schema = JSON.parse(readFileSync(root + "/" + manifest.configSchema));
    const key = "schema" + count++;
    ajv.addSchema(schema, key);
    exports[key] = key;
    schemas[JSON.stringify(canonical(schema))] = key;
  }
let code = standaloneCode(ajv, exports);
code +=
  "\nconst validators={" +
  Object.values(exports).join(",") +
  "};\nconst names=" +
  JSON.stringify(schemas) +
  ";\nexport function validateAppearance(schema,data){const canonical=" +
  canonical.toString() +
  ';const key=names[JSON.stringify(canonical(schema))];const v=validators[key];return v?{valid:v(data),errors:JSON.stringify(v.errors||[])}:{valid:true,errors:""};}\n';
writeFileSync(
  "web/studio/api/validators.ts",
  "// @ts-nocheck\n/* prettier-ignore-start */\n// Generated AJV standalone validators. No runtime eval; unknown schemas use backend validation.\n" +
    code,
);
