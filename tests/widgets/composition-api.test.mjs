import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const binary = process.env.WIDGETCTL || "build/widgetctl";
test(
  "composition commands share revisioned persistence, immutable publication and history",
  { skip: !existsSync(binary) },
  () => {
    const root = mkdtempSync(join(tmpdir(), "composition-api-"));
    const run = (args, ok = true) => {
      const r = spawnSync(
        binary,
        ["--config", root, "--assets", resolve("data/web"), ...args, "--json"],
        { encoding: "utf8" },
      );
      const packet = JSON.parse(r.stdout);
      assert.equal(packet.ok, ok, r.stdout + r.stderr);
      return ok ? packet.data : packet.error;
    };
    try {
      let p = run(["compositions", "create", "--name", "Main overlay"]);
      const id = p.id;
      assert.equal(p.autoPublish, false);
      assert.equal(p.settings.composition.contract, "obs-widget-composition");
      const widget = {
        template: { id: "builtin.chat", version: "2.0.0" },
        enabled: true,
        locked: false,
        visible: true,
        transform: {
          x: 30,
          y: 30,
          width: 450,
          height: 600,
          rotation: 0,
          opacity: 1,
        },
        zIndex: 1,
        settings: {},
      };
      assert.equal(
        run(["compositions", "widgets", "add", id], false).code,
        "REVISION_REQUIRED",
      );
      const previous = p.revision;
      p = run([
        "compositions",
        "widgets",
        "add",
        id,
        "--if-revision",
        p.revision,
        ...Object.entries(widget).flatMap(([key, value]) => [
          "--set",
          key + "=" + JSON.stringify(value),
        ]),
      ]);
      assert.equal(p.settings.composition.widgets.length, 1);
      const widgetId = p.settings.composition.widgets[0].id;
      assert.equal(
        run(["compositions", "update", id, "--if-revision", previous], false)
          .code,
        "REVISION_CONFLICT",
      );
      const release = run([
        "compositions",
        "publish",
        id,
        "--if-revision",
        p.revision,
      ]);
      const output = readFileSync(
        join(root, "widgets", id, "index.html"),
        "utf8",
      );
      assert.match(output, /releases/);
      p = run(["compositions", "get", id]);
      const invalid = [
        ...p.settings.composition.widgets,
        p.settings.composition.widgets[0],
      ];
      assert.equal(
        run(
          [
            "compositions",
            "update",
            id,
            "--if-revision",
            p.revision,
            "--set",
            "widgets=" + JSON.stringify(invalid),
          ],
          false,
        ).code,
        "COMPOSITION_INVALID",
      );
      assert.equal(
        readFileSync(join(root, "widgets", id, "index.html"), "utf8"),
        output,
      );
      p = run([
        "compositions",
        "widgets",
        "update",
        id,
        widgetId,
        "--if-revision",
        p.revision,
        "--set",
        "visible=false",
      ]);
      assert.equal(p.settings.composition.widgets[0].visible, false);
      const duplicate = run([
        "compositions",
        "duplicate",
        id,
        "--if-revision",
        p.revision,
      ]);
      assert.notEqual(duplicate.id, id);
      assert.equal(run(["compositions", "list"]).length, 2);
      assert.ok(run(["compositions", "history", id]).length > 0);
      assert.ok(release.buildId);
      const invalidSource = join(root, "invalid.html");
      writeFileSync(
        invalidSource,
        "<!doctype html><html><head><script>function broken( {</script></head><body></body></html>",
      );
      const broken = run([
        "widgets",
        "files",
        "write",
        id,
        "src/index.html",
        "--if-revision",
        p.revision,
        "--from-file",
        invalidSource,
      ]);
      assert.equal(
        run(
          ["compositions", "publish", id, "--if-revision", broken.revision],
          false,
        ).code,
        "JS_SYNTAX",
      );
      assert.equal(
        readFileSync(join(root, "widgets", id, "index.html"), "utf8"),
        output,
      );
      const restored = run([
        "compositions",
        "rollback",
        id,
        "--if-revision",
        broken.revision,
        "--revision",
        p.revision,
      ]);
      assert.equal(restored.settings.composition.widgets[0].visible, false);
      run(["compositions", "publish", id, "--if-revision", restored.revision]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
