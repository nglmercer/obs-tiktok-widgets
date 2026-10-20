import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const str = (maxLength = 128, minLength = 1) => ({
  type: "string",
  minLength,
  maxLength,
});
const obj = (
  properties,
  required = Object.keys(properties),
  additionalProperties = false,
) => ({ type: "object", properties, required, additionalProperties });
const list = (items, maxItems = 128) => ({ type: "array", items, maxItems });
const identifier = {
  ...str(),
  pattern: "^[a-z][a-z0-9_-]*(?:[.][a-z0-9_-]+)+$",
};
const widgetIdentifier = {
  ...str(),
  pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$",
};
const path = {
  ...str(512),
  pattern: "^(?:src|assets|schema|presets)/[A-Za-z0-9_./-]+$",
};
const dimension = { type: "number", minimum: 1, maximum: 8192 };
const coordinate = { type: "number", minimum: -32768, maximum: 32768 };
const layer = obj(
  {
    id: str(80),
    kind: { enum: ["text", "image", "group"] },
    name: str(160, 0),
    x: coordinate,
    y: coordinate,
    width: dimension,
    height: dimension,
    rotation: { type: "number", minimum: -360, maximum: 360 },
    opacity: { type: "number", minimum: 0, maximum: 1 },
    text: str(4000, 0),
    asset: path,
    children: list({ $ref: "#/definitions/layer" }),
  },
  ["id", "kind", "x", "y", "width", "height"],
);
const layout = obj({
  width: dimension,
  height: dimension,
  layers: list({ $ref: "#/definitions/layer" }),
});
const schemas = {
  event: obj(
    {
      version: { const: 1 },
      id: str(256),
      source: identifier,
      type: identifier,
      timestamp: {
        ...str(30),
        pattern:
          "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{3})?Z$",
      },
      data: { type: "object" },
      metadata: obj(
        {
          correlationId: str(256),
          originInstance: str(128),
          hopCount: { type: "integer", minimum: 0, maximum: 4 },
          room: str(128, 0),
          legacy: { type: "object" },
        },
        [],
      ),
    },
    ["version", "id", "source", "type", "timestamp", "data"],
  ),
  manifest: obj(
    {
      contract: { const: "universal-widget" },
      schemaVersion: { const: 3 },
      id: widgetIdentifier,
      name: str(160),
      version: {
        ...str(64),
        pattern:
          "^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)?(?:[+][0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)?$",
      },
      engine: { const: "web" },
      entry: path,
      events: { ...list(identifier), uniqueItems: true },
      defaultSize: obj({ width: dimension, height: dimension }),
      schemas: obj({ settings: path, editor: path, events: path }, []),
      capabilities: { ...list(str(), 32), uniqueItems: true },
      requires: obj({ protocol: { const: 1 }, sdk: { const: 1 } }, []),
      dependencies: { type: "object", additionalProperties: str(64) },
    },
    [
      "contract",
      "schemaVersion",
      "id",
      "name",
      "version",
      "engine",
      "entry",
      "events",
      "defaultSize",
      "capabilities",
    ],
  ),
  layout: { ...layout, definitions: { layer } },
  project: {
    ...obj(
      {
        contract: { const: "universal-widget-project" },
        schemaVersion: { const: 1 },
        widget: obj({ id: widgetIdentifier, version: str(64) }),
        settings: { type: "object" },
        layout,
        state: { type: "object" },
        timeline: list(
          obj({
            layerId: str(80),
            at: { type: "number", minimum: 0 },
            duration: { type: "number", minimum: 0 },
            properties: { type: "object" },
          }),
          1024,
        ),
      },
      ["contract", "schemaVersion", "widget", "settings", "layout"],
    ),
    definitions: { layer },
  },
  settings: obj(
    {
      title: { ...str(500), default: "Universal alert" },
      color: { ...str(9), pattern: "^#[0-9a-fA-F]{6}$", default: "#ff416c" },
    },
    [],
  ),
  editor: obj(
    {
      grid: { type: "number", minimum: 1, maximum: 256 },
      bindings: list(
        obj({
          setting: str(),
          layerId: str(80),
          property: { enum: ["text", "color", "x", "y", "width", "height"] },
        }),
      ),
    },
    [],
  ),
};
const user = obj({
  id: str(128, 0),
  nickname: str(500, 0),
  handle: str(128, 0),
  avatarUrl: str(2048, 0),
});
schemas.project.properties.editor = schemas.editor;
const counter = { ...str(20), pattern: "^[0-9]+$" };
schemas.preset = {
  ...obj(
    {
      contract: { const: "universal-widget-preset" },
      schemaVersion: { const: 1 },
      widget: schemas.project.properties.widget,
      settings: { type: "object" },
      layout,
      editor: schemas.editor,
    },
    ["contract", "schemaVersion", "widget", "settings"],
  ),
  definitions: { layer },
};
schemas.payloads = {
  definitions: {
    "custom.alert": obj({ title: str(500), message: str(4000, 0) }, ["title"]),
    "tiktok.gift": obj({
      user,
      giftId: str(128, 0),
      giftName: str(500, 0),
      giftIconUrl: str(2048, 0),
      groupId: str(128, 0),
      repeatCount: counter,
      diamondCount: counter,
      repeatEnd: { type: "boolean" },
    }),
    "tiktok.chat": obj({ user, comment: str(4000, 0) }),
    "tiktok.follow": obj({ user }),
    "tiktok.like": obj({ user, count: counter, total: counter }),
  },
};
schemas.mappings = {
  definitions: {
    "tiktok.gift": {
      giftId: ["gift_id", "giftId", "string", ""],
      giftName: ["gift_name", "giftName", "string", ""],
      giftIconUrl: ["gift_image_url", "giftIconUrl", "string", ""],
      groupId: ["group_id", "groupId", "string", ""],
      repeatCount: ["repeat_count", "repeatCount", "counter", "1"],
      diamondCount: ["diamond_count", "diamondCount", "counter", "0"],
      repeatEnd: ["repeat_end", "repeatEnd", "boolean", false],
    },
    "tiktok.chat": { comment: ["comment", "comment", "string", ""] },
    "tiktok.follow": {},
    "tiktok.like": {
      count: ["count", "count", "counter", "0"],
      total: ["total", "total", "counter", "0"],
    },
  },
  user: {
    id: ["id", "userId", "string", ""],
    nickname: ["nickname", "nickname", "string", ""],
    handle: ["unique_id", "uniqueId", "string", ""],
    avatarUrl: ["avatar_url", "avatarUrl", "string", ""],
  },
};
const check = process.argv.includes("--check");
function output(file, text) {
  if (check) {
    if (readFileSync(file, "utf8") !== text)
      throw new Error("STALE_CONTRACT: " + file);
  } else writeFileSync(file, text);
}
mkdirSync(root + "schemas", { recursive: true });
for (const [name, schema] of Object.entries(schemas))
  output(
    root + `schemas/${name}.schema.json`,
    JSON.stringify(
      {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: `https://universal-widget.local/v1/${name}.schema.json`,
        ...schema,
      },
      null,
      2,
    ) + "\n",
  );
output(
  root + "schemas/native-schemas.hpp",
  "#pragma once\nnamespace uw {\n" +
    Object.keys(schemas)
      .map(
        (name) =>
          `inline constexpr const char *${name}Schema = R"UW(${JSON.stringify(schemas[name])})UW";`,
      )
      .join("\n") +
    "\n}\n",
);
console.log("Universal widget contracts " + (check ? "verified" : "generated"));
const base = JSON.parse(
  readFileSync(root + "fixtures/custom.alert.json", "utf8"),
);
const cases = [
  { name: "valid alert", valid: true, event: base },
  {
    name: "uint64 gift",
    valid: true,
    event: JSON.parse(readFileSync(root + "fixtures/tiktok.gift.json", "utf8")),
  },
  ...[
    { version: 2 },
    { type: "gift" },
    { timestamp: "2026-02-30T00:00:00Z" },
    { timestamp: "0000-01-01T00:00:00Z" },
    { id: "" },
    { data: { message: "missing title" } },
    { data: { title: "ok", command: "obs.shutdown" } },
    { metadata: { hopCount: 5 } },
    { metadata: { trusted: true } },
    { unknown: true },
  ].map((patch, index) => ({
    name: "invalid-" + index,
    valid: false,
    event: { ...base, ...patch },
  })),
];
output(
  root + "fixtures/conformance.json",
  JSON.stringify(cases, null, 2) + "\n",
);
