import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validate,
  validateEvent,
  validateManifest,
  EventRouter,
  WidgetRuntime,
  fromOBS,
  fromTikTools,
  canonical,
  replay,
} from "../index.js";
import {
  EditorSession,
  portableProject,
  migrateManifest,
  exportPreset,
  importPreset,
} from "../editor.js";
import { OBSBridge, receiverAddress } from "../transport.js";
const fixture = () =>
  JSON.parse(
    readFileSync(new URL("../fixtures/custom.alert.json", import.meta.url)),
  );
const manifest = () =>
  JSON.parse(
    readFileSync(new URL("../fixtures/manifest.json", import.meta.url)),
  );
test("cross-language golden conformance corpus", () => {
  for (const fixture of JSON.parse(
    readFileSync(new URL("../fixtures/conformance.json", import.meta.url)),
  )) {
    let valid = true;
    try {
      validateEvent(fixture.event);
    } catch {
      valid = false;
    }
    assert.equal(valid, fixture.valid, fixture.name);
  }
});
test("bridge retries preserve IDs and negotiated permissions filter unrelated events", async () => {
  const timers = [];
  const ids = [];
  let calls = 0;
  const bridge = new OBSBridge({
    token: "a".repeat(64),
    schedule: (fn, delay) => {
      const timer = { fn, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      if (timer) timer.cancelled = true;
    },
    fetcher: async (url, options) => {
      if (url.endsWith("/types"))
        return {
          ok: true,
          json: async () => ({ version: 1, types: ["custom.alert"] }),
        };
      ids.push(JSON.parse(options.body).id);
      return ++calls === 1
        ? { ok: false, status: 503 }
        : { ok: true, status: 202, json: async () => ({ result: "accepted" }) };
    },
  });
  bridge.enqueue(fixture());
  await bridge.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bridge.stats.reconnects, 1);
  timers.find((timer) => timer.delay === 250 && !timer.cancelled).fn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bridge.stats.delivered, 1);
  assert.deepEqual(ids, [fixture().id, fixture().id]);
  bridge.stop();
});
test("presets preserve identity and migrate legacy settings explicitly", () => {
  const project = portableProject(
    { id: "universal.gift-alert", version: "1.0.0" },
    { title: "A" },
  );
  assert.deepEqual(
    importPreset(project, JSON.parse(exportPreset(project))).project,
    project,
  );
  assert.equal(importPreset(project, { title: "legacy" }).warnings.length, 1);
  assert.throws(() =>
    importPreset(project, {
      contract: "universal-widget-preset",
      schemaVersion: 2,
      widget: project.widget,
      settings: {},
    }),
  );
});
test("slow widget handlers have bounded pending work and dispose drains accepted events", async () => {
  let emit, release;
  const gate = new Promise((resolve) => (release = resolve));
  let delivered = 0;
  const runtime = new WidgetRuntime(
    {
      onEvent: async () => {
        await gate;
        delivered++;
      },
    },
    {
      root: {},
      instance: "slow",
      capabilities: [
        "events.subscribe",
        "assets.read",
        "settings.read",
        "preview.inject",
      ],
      subscribe(fn) {
        emit = fn;
        return () => {};
      },
    },
    manifest(),
  );
  await runtime.initialize();
  for (let i = 0; i < 300; i++) emit({ ...fixture(), id: "slow-" + i });
  assert.equal(runtime.dropped, 44);
  release();
  await runtime.dispose();
  assert.equal(delivered, 256);
});
test("dispose during initialization never mounts or subscribes a stale widget", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const calls = [];
  const runtime = new WidgetRuntime(
    {
      initialize: () => gate,
      mount: () => calls.push("mount"),
      dispose: () => calls.push("dispose"),
    },
    {
      root: {},
      instance: "test",
      capabilities: [
        "events.subscribe",
        "assets.read",
        "settings.read",
        "preview.inject",
      ],
      subscribe() {
        calls.push("subscribe");
        return () => {};
      },
    },
    manifest(),
  );
  const starting = runtime.initialize();
  const stopping = runtime.dispose();
  release();
  await Promise.all([starting, stopping]);
  assert.deepEqual(calls, ["dispose"]);
  assert.equal(runtime.state, "disposed");
});
test("contract rejects unknown keys, versions, bad names, payloads and impossible timestamps", () => {
  assert.equal(validateEvent(fixture()).version, 1);
  for (const patch of [
    { version: 2 },
    { timestamp: "2026-02-30T14:00:00Z" },
    { id: "" },
    { type: "gift" },
    { data: [] },
    { metadata: { hopCount: 5 } },
    { unexpected: true },
    { data: { title: "ok", command: "obs.shutdown" } },
  ])
    assert.throws(() => validateEvent({ ...fixture(), ...patch }));
  assert.equal(
    validate(
      { type: "object", required: ["x"], additionalProperties: false },
      { x: 1 },
    ).length,
    1,
  );
  assert.throws(() =>
    validateEvent({ ...fixture(), data: { message: "missing title" } }),
  );
});
test("manifest identifies existing v3 separately and rejects capabilities / unsafe paths", () => {
  assert.equal(validateManifest(manifest()).engine, "web");
  for (const patch of [
    { contract: undefined },
    { entry: "src/../secrets" },
    { entry: "/tmp/a" },
    { capabilities: ["obs.scene.control"] },
  ])
    assert.throws(() => validateManifest({ ...manifest(), ...patch }));
  const result = migrateManifest({
    id: "builtin.gift",
    name: "Gift",
    version: "3.0.0",
    entry: "src/index.html",
    events: ["gift"],
  });
  assert.equal(result.manifest.events[0], "tiktok.gift");
  assert.ok(result.warnings.length);
});
test("original upstream room/message identity matches both producers without truncating uint64", () => {
  const native = fromOBS({
    type: "gift",
    room: "42",
    messageId: "18446744073709551615",
    receivedTimestamp: "1792504800000",
    data: { repeat_count: "23" },
  });
  const bridged = fromTikTools({
    topic: "live.event",
    data: {
      event: {
        type: "tiktok.gift",
        id: "new-host-id",
        timestamp: 1792504800000,
        creator: { roomId: "42" },
        data: { msgId: "18446744073709551615", repeatCount: 23 },
      },
    },
  });
  const router = new EventRouter();
  let delivered = 0;
  router.subscribe(() => delivered++);
  assert.equal(native.id, bridged.id);
  assert.equal(router.push(native), "accepted");
  assert.equal(router.push(bridged), "duplicate");
  assert.equal(delivered, 1);
  assert.equal(native.data.repeatCount, "23");
  assert.equal(fromTikTools({ topic: "event.gap", data: {} }), null);
});
test("routing rejects loops, isolates subscribers and bounds identities", () => {
  const router = new EventRouter({ capacity: 2, instance: "obs.local" });
  router.subscribe(() => {
    throw Error("widget fault");
  });
  assert.equal(
    router.push({ ...fixture(), metadata: { originInstance: "obs.local" } }),
    "loop",
  );
  for (let i = 0; i < 3; i++)
    assert.equal(router.push({ ...fixture(), id: String(i) }), "accepted");
  assert.equal(router.seen.size, 2);
  assert.equal(router.stats.failed, 3);
});
test("lifecycle delivers in order, validates settings, unsubscribes and disposes", async () => {
  const calls = [];
  let emit;
  let off = 0;
  const host = {
    root: {},
    instance: "test",
    capabilities: [
      "events.subscribe",
      "assets.read",
      "settings.read",
      "preview.inject",
    ],
    settingsSchema: {
      type: "object",
      properties: { color: { type: "string" } },
      additionalProperties: false,
    },
    subscribe(fn) {
      emit = fn;
      return () => off++;
    },
    onError(e) {
      calls.push(e.message);
    },
  };
  const runtime = new WidgetRuntime(
    {
      initialize: () => calls.push("initialize"),
      mount: () => calls.push("mount"),
      onEvent: async (e) => calls.push(e.id),
      updateSettings: () => calls.push("settings"),
      dispose: () => calls.push("dispose"),
    },
    host,
    manifest(),
  );
  await runtime.initialize({ color: "red" });
  emit(fixture());
  emit(fixture());
  await runtime.updateSettings({ color: "blue" });
  assert.throws(() => runtime.preview(fixture()));
  await runtime.dispose();
  emit({ ...fixture(), id: "after" });
  await runtime.dispose();
  assert.deepEqual(calls, [
    "initialize",
    "mount",
    fixture().id,
    "settings",
    "dispose",
  ]);
  assert.equal(off, 1);
  await assert.rejects(runtime.updateSettings({}));
});
test("portable editor round trips commands, settings, hierarchy, snap, undo and autosave", () => {
  let saved = "";
  const project = portableProject(
    { id: "universal.gift-alert", version: "1.0.0" },
    { title: "A" },
  );
  const editor = new EditorSession(project, { save: (text) => (saved = text) });
  editor.execute({ type: "editor", value: { grid: 16 } });
  assert.equal(editor.project.editor.grid, 16);
  assert.throws(() => editor.execute({ type: "editor", value: { grid: 0 } }));
  assert.equal(
    importPreset(project, JSON.parse(exportPreset(editor.project))).project
      .editor.grid,
    16,
  );
  editor.execute({
    type: "insert",
    layer: { id: "parent", kind: "group", x: 0, y: 0, width: 600, height: 400 },
  });
  editor.execute({
    type: "insert",
    parent: "parent",
    layer: {
      id: "title",
      kind: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      text: "A",
    },
  });
  editor.select(["title"]);
  editor.execute({
    type: "transform",
    id: "title",
    snap: 8,
    value: { x: 19, width: 105 },
  });
  assert.equal(editor.project.layout.layers[0].children[0].x, 16);
  const other = new EditorSession(project);
  other.import(editor.export());
  assert.equal(other.export(), saved);
  editor.undo();
  assert.equal(editor.project.layout.layers[0].children[0].x, 0);
  editor.redo();
  assert.equal(editor.project.layout.layers[0].children[0].x, 16);
  assert.throws(() =>
    editor.execute({
      type: "insert",
      layer: { id: "title", kind: "text", x: 0, y: 0, width: 1, height: 1 },
    }),
  );
  assert.throws(() =>
    editor.execute({ type: "transform", id: "title", value: { width: -10 } }),
  );
  editor.execute({ type: "remove", id: "parent" });
  assert.deepEqual(editor.selection, []);
  assert.equal(canonical(JSON.parse(saved)), saved);
});
test("fixture replay is deterministic and cancellable", () => {
  const tasks = [];
  const removed = [];
  const events = [
    fixture(),
    { ...fixture(), id: "two", timestamp: "2026-10-20T14:00:02Z" },
  ];
  const stop = replay(events, () => {}, {
    speed: 2,
    schedule: (fn, delay) => {
      tasks.push({ fn, delay });
      return tasks.length;
    },
    cancel: (id) => removed.push(id),
  });
  assert.deepEqual(
    tasks.map((t) => t.delay),
    [0, 1000],
  );
  stop();
  assert.deepEqual(removed, [1, 2]);
});
test("bridge pairs, bounds queue, preserves retry identity and handles duplicate acknowledgments", async () => {
  const requests = [];
  const scheduled = [];
  const bridge = new OBSBridge({
    token: "a".repeat(64),
    capacity: 1,
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () =>
          url.endsWith("/types")
            ? { version: 1, types: ["custom.alert"] }
            : { result: "duplicate" },
      };
    },
    schedule: (fn, delay) => {
      scheduled.push({ fn, delay });
      return scheduled.length;
    },
    cancel: () => {},
  });
  assert.equal(bridge.enqueue(fixture()), true);
  assert.equal(bridge.enqueue({ ...fixture(), id: "overflow" }), false);
  await bridge.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bridge.stats.duplicates, 1);
  assert.equal(bridge.queueDepth, 0);
  assert.equal(JSON.parse(requests[1].options.body).id, fixture().id);
  bridge.stop();
  assert.throws(() => receiverAddress("http://example.org"));
  assert.throws(() => receiverAddress("http://127.0.0.1:17453/?token=x"));
});
