import schema from "../../universal/schemas/composition.schema.json" with { type: "json" };
import { assertValid, clone } from "../../universal/index.js";
export function validateComposition(value) {
  if (JSON.stringify(value).length > 512 * 1024)
    throw new Error("COMPOSITION_SIZE_LIMIT");
  assertValid(schema, value);
  const ids = new Set();
  for (const widget of value.widgets) {
    if (ids.has(widget.id)) throw new Error("DUPLICATE_WIDGET_ID");
    ids.add(widget.id);
  }
  return value;
}
export function emptyComposition() {
  return {
    contract: "obs-widget-composition",
    schemaVersion: 1,
    viewport: { width: 1920, height: 1080 },
    background: "transparent",
    widgets: [],
  };
}
export function orderedWidgets(composition) {
  return [...composition.widgets].sort((a, b) => a.zIndex - b.zIndex);
}
export class WidgetRegistry {
  constructor() {
    this.definitions = new Map();
  }
  register(definition) {
    const key = `${definition.id}@${definition.version}`;
    if (this.definitions.has(key))
      throw new Error("DUPLICATE_TEMPLATE_VERSION");
    this.definitions.set(key, definition);
    return this;
  }
  resolve(id, version) {
    return this.definitions.get(`${id}@${version}`);
  }
}
export function patchWidget(composition, id, patch) {
  const result = clone(composition);
  const widget = result.widgets.find((item) => item.id === id);
  if (!widget) throw new Error("WIDGET_NOT_FOUND");
  if (patch.id && patch.id !== id) throw new Error("IMMUTABLE_WIDGET_ID");
  Object.assign(widget, patch);
  return validateComposition(result);
}
