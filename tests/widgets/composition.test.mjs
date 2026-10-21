import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyComposition,
  validateComposition,
  patchWidget,
  orderedWidgets,
  WidgetRegistry,
} from "../../web/renderer/app/composition.js";
const widget = (id = "chat") => ({
  id,
  template: { id: "builtin.chat", version: "2.0.0" },
  enabled: true,
  visible: true,
  locked: false,
  transform: { x: 0, y: 0, width: 450, height: 600, rotation: 0, opacity: 1 },
  zIndex: 1,
  settings: {},
});
test("composition discriminator, geometry bounds and stable unique identities", () => {
  const composition = emptyComposition();
  composition.widgets.push(widget());
  assert.equal(validateComposition(composition), composition);
  assert.throws(() =>
    validateComposition({ ...composition, contract: "universal-widget" }),
  );
  assert.throws(() =>
    validateComposition({ ...composition, schemaVersion: 3 }),
  );
  assert.throws(
    () =>
      validateComposition({ ...composition, widgets: [widget(), widget()] }),
    /DUPLICATE_WIDGET_ID/,
  );
  assert.throws(() =>
    patchWidget(composition, "chat", {
      transform: { ...widget().transform, opacity: 2 },
    }),
  );
  assert.throws(
    () => patchWidget(composition, "chat", { id: "other" }),
    /IMMUTABLE_WIDGET_ID/,
  );
  const updated = patchWidget(composition, "chat", {
    visible: false,
    group: "social",
  });
  assert.equal(composition.widgets[0].visible, true);
  assert.equal(updated.widgets[0].visible, false);
});
test("layer ordering is stable and does not mutate authoritative arrays", () => {
  const composition = emptyComposition();
  composition.widgets = [
    { ...widget("a"), zIndex: 4 },
    widget("b"),
    widget("c"),
  ];
  assert.deepEqual(
    orderedWidgets(composition).map((w) => w.id),
    ["b", "c", "a"],
  );
  assert.equal(composition.widgets[0].id, "a");
});
test("registry pins exact versions and rejects accidental replacement", () => {
  const registry = new WidgetRegistry();
  const definition = { id: "builtin.chat", version: "2.0.0" };
  registry.register(definition);
  assert.equal(registry.resolve("builtin.chat", "2.0.0"), definition);
  assert.equal(registry.resolve("builtin.chat", "3.0.0"), undefined);
  assert.throws(
    () => registry.register(definition),
    /DUPLICATE_TEMPLATE_VERSION/,
  );
});
