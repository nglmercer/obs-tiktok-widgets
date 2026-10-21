"use strict";
(() => {
  // web/universal/schemas/event.schema.json
  var event_schema_default = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://universal-widget.local/v1/event.schema.json",
    type: "object",
    properties: {
      version: {
        const: 1
      },
      id: {
        type: "string",
        minLength: 1,
        maxLength: 256
      },
      source: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        pattern: "^[a-z][a-z0-9_-]*(?:[.][a-z0-9_-]+)+$"
      },
      type: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        pattern: "^[a-z][a-z0-9_-]*(?:[.][a-z0-9_-]+)+$"
      },
      timestamp: {
        type: "string",
        minLength: 1,
        maxLength: 30,
        pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{3})?Z$"
      },
      data: {
        type: "object"
      },
      metadata: {
        type: "object",
        properties: {
          correlationId: {
            type: "string",
            minLength: 1,
            maxLength: 256
          },
          originInstance: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          hopCount: {
            type: "integer",
            minimum: 0,
            maximum: 4
          },
          room: {
            type: "string",
            minLength: 0,
            maxLength: 128
          },
          legacy: {
            type: "object"
          }
        },
        required: [],
        additionalProperties: false
      }
    },
    required: [
      "version",
      "id",
      "source",
      "type",
      "timestamp",
      "data"
    ],
    additionalProperties: false
  };

  // web/universal/schemas/manifest.schema.json
  var manifest_schema_default = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://universal-widget.local/v1/manifest.schema.json",
    type: "object",
    properties: {
      contract: {
        const: "universal-widget"
      },
      schemaVersion: {
        const: 3
      },
      id: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
      },
      name: {
        type: "string",
        minLength: 1,
        maxLength: 160
      },
      version: {
        type: "string",
        minLength: 1,
        maxLength: 64,
        pattern: "^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)?(?:[+][0-9A-Za-z-]+(?:[.][0-9A-Za-z-]+)*)?$"
      },
      engine: {
        const: "web"
      },
      entry: {
        type: "string",
        minLength: 1,
        maxLength: 512,
        pattern: "^(?:src|assets|schema|presets)/[A-Za-z0-9_./-]+$"
      },
      events: {
        type: "array",
        items: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          pattern: "^[a-z][a-z0-9_-]*(?:[.][a-z0-9_-]+)+$"
        },
        maxItems: 128,
        uniqueItems: true
      },
      defaultSize: {
        type: "object",
        properties: {
          width: {
            type: "number",
            minimum: 1,
            maximum: 8192
          },
          height: {
            type: "number",
            minimum: 1,
            maximum: 8192
          }
        },
        required: [
          "width",
          "height"
        ],
        additionalProperties: false
      },
      schemas: {
        type: "object",
        properties: {
          settings: {
            type: "string",
            minLength: 1,
            maxLength: 512,
            pattern: "^(?:src|assets|schema|presets)/[A-Za-z0-9_./-]+$"
          },
          editor: {
            type: "string",
            minLength: 1,
            maxLength: 512,
            pattern: "^(?:src|assets|schema|presets)/[A-Za-z0-9_./-]+$"
          },
          events: {
            type: "string",
            minLength: 1,
            maxLength: 512,
            pattern: "^(?:src|assets|schema|presets)/[A-Za-z0-9_./-]+$"
          }
        },
        required: [],
        additionalProperties: false
      },
      capabilities: {
        type: "array",
        items: {
          type: "string",
          minLength: 1,
          maxLength: 128
        },
        maxItems: 32,
        uniqueItems: true
      },
      requires: {
        type: "object",
        properties: {
          protocol: {
            const: 1
          },
          sdk: {
            const: 1
          }
        },
        required: [],
        additionalProperties: false
      },
      dependencies: {
        type: "object",
        additionalProperties: {
          type: "string",
          minLength: 1,
          maxLength: 64
        }
      }
    },
    required: [
      "contract",
      "schemaVersion",
      "id",
      "name",
      "version",
      "engine",
      "entry",
      "events",
      "defaultSize",
      "capabilities"
    ],
    additionalProperties: false
  };

  // web/universal/schemas/project.schema.json
  var project_schema_default = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://universal-widget.local/v1/project.schema.json",
    type: "object",
    properties: {
      contract: {
        const: "universal-widget-project"
      },
      schemaVersion: {
        const: 1
      },
      widget: {
        type: "object",
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128,
            pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$"
          },
          version: {
            type: "string",
            minLength: 1,
            maxLength: 64
          }
        },
        required: [
          "id",
          "version"
        ],
        additionalProperties: false
      },
      settings: {
        type: "object"
      },
      layout: {
        type: "object",
        properties: {
          width: {
            type: "number",
            minimum: 1,
            maximum: 8192
          },
          height: {
            type: "number",
            minimum: 1,
            maximum: 8192
          },
          layers: {
            type: "array",
            items: {
              $ref: "#/definitions/layer"
            },
            maxItems: 128
          }
        },
        required: [
          "width",
          "height",
          "layers"
        ],
        additionalProperties: false
      },
      state: {
        type: "object"
      },
      timeline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            layerId: {
              type: "string",
              minLength: 1,
              maxLength: 80
            },
            at: {
              type: "number",
              minimum: 0
            },
            duration: {
              type: "number",
              minimum: 0
            },
            properties: {
              type: "object"
            }
          },
          required: [
            "layerId",
            "at",
            "duration",
            "properties"
          ],
          additionalProperties: false
        },
        maxItems: 1024
      },
      editor: {
        type: "object",
        properties: {
          grid: {
            type: "number",
            minimum: 1,
            maximum: 256
          },
          bindings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                setting: {
                  type: "string",
                  minLength: 1,
                  maxLength: 128
                },
                layerId: {
                  type: "string",
                  minLength: 1,
                  maxLength: 80
                },
                property: {
                  enum: [
                    "text",
                    "color",
                    "x",
                    "y",
                    "width",
                    "height"
                  ]
                }
              },
              required: [
                "setting",
                "layerId",
                "property"
              ],
              additionalProperties: false
            },
            maxItems: 128
          }
        },
        required: [],
        additionalProperties: false
      }
    },
    required: [
      "contract",
      "schemaVersion",
      "widget",
      "settings",
      "layout"
    ],
    additionalProperties: false,
    definitions: {
      layer: {
        type: "object",
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 80
          },
          kind: {
            enum: [
              "text",
              "image",
              "group"
            ]
          },
          name: {
            type: "string",
            minLength: 0,
            maxLength: 160
          },
          x: {
            type: "number",
            minimum: -32768,
            maximum: 32768
          },
          y: {
            type: "number",
            minimum: -32768,
            maximum: 32768
          },
          width: {
            type: "number",
            minimum: 1,
            maximum: 8192
          },
          height: {
            type: "number",
            minimum: 1,
            maximum: 8192
          },
          rotation: {
            type: "number",
            minimum: -360,
            maximum: 360
          },
          opacity: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          text: {
            type: "string",
            minLength: 0,
            maxLength: 4e3
          },
          asset: {
            type: "string",
            minLength: 1,
            maxLength: 512,
            pattern: "^(?:src|assets|schema|presets)/[A-Za-z0-9_./-]+$"
          },
          children: {
            type: "array",
            items: {
              $ref: "#/definitions/layer"
            },
            maxItems: 128
          }
        },
        required: [
          "id",
          "kind",
          "x",
          "y",
          "width",
          "height"
        ],
        additionalProperties: false
      }
    }
  };

  // web/universal/layout.js
  function renderLayout(project, container, assetBase) {
    const stage = document.createElement("div");
    stage.className = "universal-layout";
    stage.style.cssText = `position:absolute;left:0;top:0;width:${project.layout.width}px;height:${project.layout.height}px;pointer-events:none;color:white;font-family:system-ui`;
    function visit(layers, parent) {
      for (const layer of layers) {
        const node = document.createElement("div");
        node.dataset.layer = layer.id;
        node.textContent = layer.text || "";
        node.style.cssText = `position:absolute;box-sizing:border-box;white-space:pre-wrap;overflow:hidden;left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;transform:rotate(${layer.rotation || 0}deg);opacity:${layer.opacity ?? 1}`;
        if (layer.kind === "image" && layer.asset) {
          const img = document.createElement("img");
          img.src = new URL(layer.asset, assetBase).href;
          img.alt = layer.name || "";
          img.style.cssText = "width:100%;height:100%;object-fit:contain";
          node.append(img);
        }
        parent.append(node);
        visit(layer.children ?? [], node);
      }
    }
    visit(project.layout.layers, stage);
    container.append(stage);
    return () => stage.remove();
  }

  // web/universal/schemas/mappings.schema.json
  var mappings_schema_default = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://universal-widget.local/v1/mappings.schema.json",
    definitions: {
      "tiktok.gift": {
        giftId: [
          "gift_id",
          "giftId",
          "string",
          ""
        ],
        giftName: [
          "gift_name",
          "giftName",
          "string",
          ""
        ],
        giftIconUrl: [
          "gift_image_url",
          "giftIconUrl",
          "string",
          ""
        ],
        groupId: [
          "group_id",
          "groupId",
          "string",
          ""
        ],
        repeatCount: [
          "repeat_count",
          "repeatCount",
          "counter",
          "1"
        ],
        diamondCount: [
          "diamond_count",
          "diamondCount",
          "counter",
          "0"
        ],
        repeatEnd: [
          "repeat_end",
          "repeatEnd",
          "boolean",
          false
        ]
      },
      "tiktok.chat": {
        comment: [
          "comment",
          "comment",
          "string",
          ""
        ]
      },
      "tiktok.follow": {},
      "tiktok.like": {
        count: [
          "count",
          "count",
          "counter",
          "0"
        ],
        total: [
          "total",
          "total",
          "counter",
          "0"
        ]
      }
    },
    user: {
      id: [
        "id",
        "userId",
        "string",
        ""
      ],
      nickname: [
        "nickname",
        "nickname",
        "string",
        ""
      ],
      handle: [
        "unique_id",
        "uniqueId",
        "string",
        ""
      ],
      avatarUrl: [
        "avatar_url",
        "avatarUrl",
        "string",
        ""
      ]
    }
  };

  // web/universal/normalize.js
  function fields(mapping, input, index) {
    const result = {};
    for (const [key, rule] of Object.entries(mapping)) {
      const value = input?.[rule[index]];
      if (rule[2] === "boolean")
        result[key] = typeof value === "boolean" ? value : rule[3];
      else if (rule[2] === "counter")
        result[key] = typeof value === "string" && /^[0-9]{1,20}$/.test(value) ? value : Number.isSafeInteger(value) && value >= 0 ? String(value) : rule[3];
      else result[key] = typeof value === "string" ? value : rule[3];
    }
    return result;
  }
  function normalizeData(type, input, user, index) {
    const mapping = mappings_schema_default.definitions[type];
    if (!mapping) return JSON.parse(JSON.stringify(input));
    return {
      ...fields(mapping, input, index),
      user: fields(mappings_schema_default.user, user, index)
    };
  }

  // web/universal/schemas/payloads.schema.json
  var payloads_schema_default = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://universal-widget.local/v1/payloads.schema.json",
    definitions: {
      "custom.alert": {
        type: "object",
        properties: {
          title: {
            type: "string",
            minLength: 1,
            maxLength: 500
          },
          message: {
            type: "string",
            minLength: 0,
            maxLength: 4e3
          }
        },
        required: [
          "title"
        ],
        additionalProperties: false
      },
      "tiktok.gift": {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              nickname: {
                type: "string",
                minLength: 0,
                maxLength: 500
              },
              handle: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              avatarUrl: {
                type: "string",
                minLength: 0,
                maxLength: 2048
              }
            },
            required: [
              "id",
              "nickname",
              "handle",
              "avatarUrl"
            ],
            additionalProperties: false
          },
          giftId: {
            type: "string",
            minLength: 0,
            maxLength: 128
          },
          giftName: {
            type: "string",
            minLength: 0,
            maxLength: 500
          },
          giftIconUrl: {
            type: "string",
            minLength: 0,
            maxLength: 2048
          },
          groupId: {
            type: "string",
            minLength: 0,
            maxLength: 128
          },
          repeatCount: {
            type: "string",
            minLength: 1,
            maxLength: 20,
            pattern: "^[0-9]+$"
          },
          diamondCount: {
            type: "string",
            minLength: 1,
            maxLength: 20,
            pattern: "^[0-9]+$"
          },
          repeatEnd: {
            type: "boolean"
          }
        },
        required: [
          "user",
          "giftId",
          "giftName",
          "giftIconUrl",
          "groupId",
          "repeatCount",
          "diamondCount",
          "repeatEnd"
        ],
        additionalProperties: false
      },
      "tiktok.chat": {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              nickname: {
                type: "string",
                minLength: 0,
                maxLength: 500
              },
              handle: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              avatarUrl: {
                type: "string",
                minLength: 0,
                maxLength: 2048
              }
            },
            required: [
              "id",
              "nickname",
              "handle",
              "avatarUrl"
            ],
            additionalProperties: false
          },
          comment: {
            type: "string",
            minLength: 0,
            maxLength: 4e3
          }
        },
        required: [
          "user",
          "comment"
        ],
        additionalProperties: false
      },
      "tiktok.follow": {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              nickname: {
                type: "string",
                minLength: 0,
                maxLength: 500
              },
              handle: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              avatarUrl: {
                type: "string",
                minLength: 0,
                maxLength: 2048
              }
            },
            required: [
              "id",
              "nickname",
              "handle",
              "avatarUrl"
            ],
            additionalProperties: false
          }
        },
        required: [
          "user"
        ],
        additionalProperties: false
      },
      "tiktok.like": {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              nickname: {
                type: "string",
                minLength: 0,
                maxLength: 500
              },
              handle: {
                type: "string",
                minLength: 0,
                maxLength: 128
              },
              avatarUrl: {
                type: "string",
                minLength: 0,
                maxLength: 2048
              }
            },
            required: [
              "id",
              "nickname",
              "handle",
              "avatarUrl"
            ],
            additionalProperties: false
          },
          count: {
            type: "string",
            minLength: 1,
            maxLength: 20,
            pattern: "^[0-9]+$"
          },
          total: {
            type: "string",
            minLength: 1,
            maxLength: 20,
            pattern: "^[0-9]+$"
          }
        },
        required: [
          "user",
          "count",
          "total"
        ],
        additionalProperties: false
      }
    }
  };

  // web/universal/index.js
  var nativeSequence = 0;
  var capabilities = Object.freeze([
    "events.subscribe",
    "assets.read",
    "settings.read",
    "preview.inject"
  ]);
  var clone = (value) => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object")
      return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    const result = JSON.stringify(value);
    if (result === void 0 || typeof value === "number" && !Number.isFinite(value))
      throw new Error("NON_JSON_VALUE");
    return result;
  }
  function validate(schema, value, path = "$", root2 = schema, depth = 0) {
    if (depth > 64) return [`${path}: schema depth limit`];
    const errors = [];
    const fail = (message) => errors.push(`${path}: ${message}`);
    if (schema === true) return errors;
    if (schema === false) return [`${path}: forbidden`];
    if (schema.$ref) {
      if (!schema.$ref.startsWith("#/"))
        return [`${path}: external schema reference unsupported`];
      const target = schema.$ref.slice(2).split("/").reduce((v, k) => v?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], root2);
      return target ? validate(target, value, path, root2, depth + 1) : [`${path}: unresolved reference`];
    }
    const types = {
      object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
      array: Array.isArray,
      string: (v) => typeof v === "string",
      integer: Number.isInteger,
      number: (v) => typeof v === "number" && Number.isFinite(v),
      boolean: (v) => typeof v === "boolean",
      null: (v) => v === null
    };
    if (schema.type && ![schema.type].flat().some((type) => types[type]?.(value)))
      return [`${path}: expected ${schema.type}`];
    if ("const" in schema && canonical(value) !== canonical(schema.const))
      fail("const");
    if (schema.enum && !schema.enum.some((v) => canonical(v) === canonical(value)))
      fail("enum");
    if (typeof value === "string") {
      const length = [...value].length;
      if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity))
        fail("string length");
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(value))
        fail("pattern");
    }
    if (typeof value === "number" && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)))
      fail("number range");
    if (Array.isArray(value)) {
      if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))
        fail("array length");
      if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length)
        fail("duplicate items");
      if ("items" in schema)
        value.forEach(
          (v, i) => errors.push(
            ...validate(schema.items, v, `${path}/${i}`, root2, depth + 1)
          )
        );
    } else if (value && typeof value === "object") {
      for (const key of schema.required ?? [])
        if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
      for (const [key, v] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) {
          fail("unsafe key");
          continue;
        }
        const child = schema.properties?.[key] ?? schema.additionalProperties;
        if (child !== void 0)
          errors.push(...validate(child, v, `${path}/${key}`, root2, depth + 1));
      }
    }
    return errors;
  }
  function assertValid(schema, value) {
    const errors = validate(schema, value);
    if (errors.length) throw new Error("INVALID_SCHEMA: " + errors.join("; "));
    return value;
  }
  function validateEvent(value) {
    assertValid(event_schema_default, value);
    if (value.timestamp.startsWith("0000") || !Number.isFinite(Date.parse(value.timestamp)) || new Date(value.timestamp).toISOString().replace(".000Z", "Z") !== value.timestamp.replace(/\.000Z$/, "Z"))
      throw new Error("INVALID_TIMESTAMP");
    if (payloads_schema_default.definitions[value.type])
      assertValid(payloads_schema_default.definitions[value.type], value.data);
    return value;
  }
  function safePath(value) {
    return typeof value === "string" && /^[A-Za-z0-9_./-]+$/.test(value) && !value.startsWith("/") && value.split("/").every(
      (p) => p && p !== "." && p !== ".." && !p.endsWith(".") && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)
    );
  }
  function validateManifest(value, supported = capabilities) {
    assertValid(manifest_schema_default, value);
    const prerelease = value.version.split("+")[0].split("-").slice(1).join("-");
    if (prerelease.split(".").some((part) => /^0[0-9]+$/.test(part)))
      throw Error("INVALID_SEMVER");
    for (const path of [value.entry, ...Object.values(value.schemas ?? {})])
      if (!safePath(path)) throw new Error("UNSAFE_PATH");
    for (const capability of value.capabilities)
      if (!supported.includes(capability))
        throw new Error(`UNSUPPORTED_CAPABILITY: ${capability}`);
    if (Object.keys(value.dependencies ?? {}).length)
      throw new Error(
        "UNSUPPORTED_DEPENDENCY: bundle dependencies in the package"
      );
    return value;
  }
  function validateProject(value) {
    assertValid(project_schema_default, value);
    const ids = /* @__PURE__ */ new Set();
    function visit(layers, depth = 0) {
      if (depth > 32) throw Error("LAYOUT_DEPTH_LIMIT");
      for (const layer of layers) {
        if (ids.has(layer.id)) throw Error("DUPLICATE_LAYER");
        ids.add(layer.id);
        if (ids.size > 1024) throw Error("LAYER_LIMIT");
        if (layer.asset && !safePath(layer.asset)) throw Error("UNSAFE_ASSET");
        if (layer.kind === "image" && !layer.asset)
          throw Error("IMAGE_ASSET_REQUIRED");
        visit(layer.children ?? [], depth + 1);
      }
    }
    visit(value.layout.layers);
    return value;
  }
  function fromOBS(event, instance = "obs.native") {
    const display = event.native?.data?.common?.displayText?.key ?? "";
    const type = event.type === "roomUser" ? "room_stats" : event.type === "social" && /follow/i.test(display) && !/unfollow/i.test(display) ? "follow" : event.type;
    const id = event.messageId && event.messageId !== "0" ? `${event.room || ""}:${event.messageId}` : `${instance}:${event.receivedTimestamp}:${++nativeSequence}`;
    return {
      version: 1,
      id,
      source: "tiktok.native",
      type: `tiktok.${type}`,
      timestamp: new Date(Number(event.receivedTimestamp)).toISOString(),
      data: normalizeData(
        `tiktok.${type}`,
        event.data ?? {},
        event.data?.user,
        0
      ),
      metadata: {
        originInstance: instance,
        hopCount: 0,
        room: event.room || "",
        legacy: clone(event)
      }
    };
  }
  var EventRouter = class {
    constructor({ capacity = 8192, instance = "widget", maxHop = 4 } = {}) {
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 65536 || !Number.isInteger(maxHop) || maxHop < 1 || maxHop > 4)
        throw Error("INVALID_ROUTER_LIMIT");
      this.capacity = capacity;
      this.instance = instance;
      this.maxHop = maxHop;
      this.seen = /* @__PURE__ */ new Map();
      this.handlers = /* @__PURE__ */ new Set();
      this.stats = {
        accepted: 0,
        duplicate: 0,
        rejected: 0,
        delivered: 0,
        failed: 0
      };
    }
    subscribe(fn) {
      this.handlers.add(fn);
      return () => this.handlers.delete(fn);
    }
    push(event) {
      try {
        validateEvent(event);
      } catch {
        this.stats.rejected++;
        return "invalid";
      }
      if (event.metadata?.originInstance === this.instance || (event.metadata?.hopCount ?? 0) >= this.maxHop) {
        this.stats.rejected++;
        return "loop";
      }
      const key = `${event.type}:${event.type.startsWith("tiktok.") ? "" : event.source + ":"}${event.id}`;
      if (this.seen.has(key)) {
        this.stats.duplicate++;
        return "duplicate";
      }
      this.seen.set(key, true);
      if (this.seen.size > this.capacity)
        this.seen.delete(this.seen.keys().next().value);
      this.stats.accepted++;
      for (const fn of this.handlers) {
        try {
          fn(clone(event));
          this.stats.delivered++;
        } catch {
          this.stats.failed++;
        }
      }
      return "accepted";
    }
  };
  var WidgetRuntime = class {
    constructor(widget2, host, manifest2) {
      validateManifest(manifest2, host.capabilities);
      this.widget = widget2;
      this.host = host;
      this.manifest = manifest2;
      this.state = "new";
      this.router = new EventRouter({ instance: host.instance });
      this.pending = Promise.resolve();
      this.pendingCount = 0;
      this.dropped = 0;
    }
    async initialize(settings2 = {}) {
      if (this.state !== "new") throw new Error("INVALID_LIFECYCLE");
      this.state = "initializing";
      this.initialization = (async () => {
        try {
          if (this.host.settingsSchema)
            assertValid(this.host.settingsSchema, settings2);
          await this.widget.initialize?.({
            settings: clone(settings2),
            capabilities: [...this.manifest.capabilities]
          });
          if (this.state !== "initializing") return;
          await this.widget.mount?.(this.host.root);
          if (this.state !== "initializing") return;
          const project = this.host.project ?? globalThis.window?.UniversalWidgetProject;
          if (project) {
            validateProject(project);
            const base = this.host.assetBase ?? new URL(
              "../".repeat(this.manifest.entry.split("/").length - 1),
              document.baseURI
            ).href;
            this.removeLayout = renderLayout(
              project,
              this.host.root.parentElement,
              base
            );
          }
          this.state = "mounted";
          this.router.subscribe((event) => {
            if (this.manifest.events.includes(event.type))
              this.enqueue(() => this.widget.onEvent?.(event));
          });
          if (this.manifest.capabilities.includes("events.subscribe"))
            this.off = this.host.subscribe(
              (event) => this.state === "mounted" && this.router.push(event)
            );
        } catch (error) {
          if (this.state !== "disposed") {
            this.state = "failed";
            await this.cleanup();
          }
          throw error;
        }
      })();
      return this.initialization;
    }
    enqueue(fn) {
      if (this.pendingCount >= 256) {
        this.dropped++;
        return Promise.resolve();
      }
      this.pendingCount++;
      this.pending = this.pending.then(fn).catch((error) => {
        try {
          this.host.onError?.(error);
        } catch {
        }
      }).finally(() => this.pendingCount--);
      return this.pending;
    }
    async updateSettings(settings2) {
      if (this.state !== "mounted") throw new Error("INVALID_LIFECYCLE");
      if (this.host.settingsSchema)
        assertValid(this.host.settingsSchema, settings2);
      return this.enqueue(() => this.widget.updateSettings?.(clone(settings2)));
    }
    preview(event) {
      if (this.state !== "mounted" || !this.host.preview || !this.manifest.capabilities.includes("preview.inject"))
        throw new Error("PREVIEW_ONLY");
      return this.router.push(event);
    }
    async dispose() {
      if (this.state === "disposed") return;
      this.state = "disposed";
      this.off?.();
      await this.initialization?.catch(() => {
      });
      await this.pending;
      await this.cleanup();
    }
    async cleanup() {
      if (this.cleaned) return;
      this.cleaned = true;
      this.removeLayout?.();
      await this.widget.dispose?.();
    }
  };
  function browserHost(root2, {
    preview: preview2 = false,
    instance = "browser",
    settingsSchema,
    onError = console.error
  } = {}) {
    return {
      root: root2,
      instance,
      preview: preview2,
      settingsSchema,
      onError,
      capabilities,
      subscribe(fn) {
        const canonicalHandler = (e) => fn(e.detail);
        window.addEventListener("universal:event", canonicalHandler);
        return () => window.removeEventListener("universal:event", canonicalHandler);
      }
    };
  }

  // web/templates/universal.gift-alert/1.0.0/src/main.js
  var manifest = {
    contract: "universal-widget",
    schemaVersion: 3,
    id: "universal.gift-alert",
    name: "Universal Alert",
    version: "1.0.0",
    engine: "web",
    entry: "src/index.html",
    events: ["custom.alert", "tiktok.gift"],
    defaultSize: { width: 600, height: 400 },
    capabilities: [
      "events.subscribe",
      "assets.read",
      "settings.read",
      "preview.inject"
    ]
  };
  var root = document.getElementById("root");
  var settings = {};
  var gifts = /* @__PURE__ */ new Map();
  var widget = {
    initialize(context) {
      settings = context.settings;
    },
    mount() {
      root.style.setProperty(
        "--accent",
        /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : "#ff416c"
      );
    },
    updateSettings(value) {
      settings = value;
      this.mount();
    },
    onEvent(event) {
      const key = event.type === "tiktok.gift" ? `${event.data.user?.id || ""}:${event.data.giftId}:${event.data.groupId || event.id}` : void 0;
      if (key && gifts.has(key)) {
        gifts.get(key).querySelector("p").textContent = `${event.data.giftName || "Gift"} \xD7 ${event.data.repeatCount}`;
        return;
      }
      const card = document.createElement("article"), title = document.createElement("h2"), message = document.createElement("p");
      card.className = "alert";
      title.textContent = event.type === "custom.alert" ? event.data.title : settings.title || "Gift received";
      message.textContent = event.type === "custom.alert" ? event.data.message || "" : `${event.data.giftName || "Gift"} \xD7 ${event.data.repeatCount}`;
      card.append(title, message);
      root.append(card);
      if (key) {
        gifts.set(key, card);
        card.dataset.giftKey = key;
      }
      while (root.children.length > 5) {
        gifts.delete(root.firstChild.dataset.giftKey);
        root.firstChild.remove();
      }
    },
    dispose() {
      gifts.clear();
      root.replaceChildren();
    }
  };
  var preview = new URLSearchParams(location.search).has("__playground");
  var runtime = new WidgetRuntime(
    widget,
    browserHost(root, { preview }),
    manifest
  );
  runtime.initialize(window.TikTokWidgetConfig || {}).catch(console.error);
  window.addEventListener("pagehide", () => runtime.dispose(), { once: true });
  if (preview)
    window.addEventListener(
      "universal:preview",
      (event) => runtime.preview(event.detail)
    );
  if (preview) {
    window.addEventListener("tiktok:event", (event) => {
      const canonical2 = fromOBS(event.detail, "preview.local");
      if (event.detail.type === "custom.alert") {
        canonical2.type = "custom.alert";
        canonical2.data = {
          title: settings.title || "Test alert",
          message: "Viewer123 sends Rose \xD723"
        };
      }
      runtime.preview(canonical2);
    });
    window.addEventListener("tiktok:preview-settings", (event) => {
      const next = {};
      for (const key of ["title", "color"])
        if (key in event.detail) next[key] = event.detail[key];
      runtime.updateSettings(next);
    });
  }
})();
