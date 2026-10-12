import { nativeCatalog } from "./package-locales.mjs";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import ts from "typescript";
const en = JSON.parse(fs.readFileSync("web/shared/i18n/en.json", "utf8"));
const es = JSON.parse(fs.readFileSync("web/shared/i18n/es.json", "utf8"));
assert.deepEqual(
  Object.keys(en).sort(),
  Object.keys(es).sort(),
  "Locale keys differ",
);
const placeholders = (value) =>
  [...value.matchAll(/\{(\w+)\}|%(\d+)/g)].map((m) => m[0]).sort();
for (const key of Object.keys(en)) {
  assert.ok(es[key], `Empty translation: ${key}`);
  assert.deepEqual(
    placeholders(en[key]),
    placeholders(es[key]),
    `Placeholder mismatch: ${key}`,
  );
}
function files(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((f) =>
      f.isDirectory()
        ? files(path.join(root, f.name))
        : [path.join(root, f.name)],
    );
}
const missing = new Set();
for (const file of [...files("web/studio"), ...files("web/playground")].filter(
  (f) => /\.tsx?$/.test(f),
)) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ["t", "tr"].includes(node.expression.text) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      !en[node.arguments[0].text]
    )
      missing.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
for (const action of JSON.parse(
  fs.readFileSync("web/shared/actions.json", "utf8"),
))
  for (const field of ["label", "description"])
    if (!en[action[field]]) missing.add(action[field]);
for (const match of fs
  .readFileSync("web/playground/index.html", "utf8")
  .matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g))
  if (!en[match[1]]) missing.add(match[1]);
for (const file of fs
  .readdirSync("src/ui")
  .filter((name) => /\.(cpp|hpp)$/.test(name))) {
  const source = fs.readFileSync(`src/ui/${file}`, "utf8");
  for (const match of source.matchAll(/uiTr\("((?:[^"\\]|\\.)*)"\)/g)) {
    const key = JSON.parse(`"${match[1]}"`);
    if (!en[key]) missing.add(key);
  }
}
assert.equal(
  missing.size,
  0,
  "Missing UI translations:\n" + [...missing].join("\n"),
);
console.log(
  `Verified ${Object.keys(en).length} English/Spanish keys, placeholders and static UI lookups`,
);

for (const locale of ["en", "es"])
  assert.equal(
    fs.readFileSync(`src/ui/i18n/${locale}.ts`, "utf8"),
    nativeCatalog(locale),
    "Native catalog differs: run node tools/package-locales.mjs --compile",
  );
