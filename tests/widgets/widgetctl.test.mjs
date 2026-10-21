import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
const binary = process.env.WIDGETCTL || "build/widgetctl";
const available = fs.existsSync(binary);
test(
  "widgetctl full offline API, revision conflicts, package and project CRUD, structured failures",
  { skip: !available },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "widgetctl-api-"));
    const assets = path.resolve("data/web");

    const run = (args, code = 0) => {
      const r = spawnSync(
        binary,
        ["--config", root, "--assets", assets, ...args, "--json"],
        { encoding: "utf8" },
      );
      assert.equal(r.status, code, r.stderr + r.stdout);
      const value = JSON.parse(r.stdout);
      assert.equal(value.apiVersion, 1);
      assert.equal(value.ok, code === 0);
      return value;
    };
    try {
      const doctor = run(["doctor"]).data;
      assert.equal(doctor.runtimeNodeRequired, false);
      const templates = run(["templates", "list"]).data;
      assert.equal(
        templates.filter((t) => t.id.startsWith("builtin.")).length,
        8,
      );
      assert.ok(templates.some((t) => t.id === "universal.gift-alert"));
      assert.ok(
        run(["templates", "list"]).data.every(
          (t) => !t.build || t.build.mode === "static",
        ),
      );
      assert.equal(
        run(["builders", "install", "--confirm"], 4).error.code,
        "DEVELOPMENT_ONLY",
      );
      assert.equal(
        run(["templates", "inspect", "builtin.gift-alert"]).data.entry,
        "src/index.html",
      );
      const archive = path.join(root, "template.tiktokwidget");
      run(["templates", "export", "builtin.gift-alert", "--output", archive]);
      assert.ok(fs.existsSync(archive));
      run(["templates", "install", archive, "--dry-run"]);
      run(["templates", "create", "user.rose", "--from", "builtin.gift-alert"]);
      const customArchive = path.join(root, "user.tiktokwidget");
      run(["templates", "export", "user.rose", "--output", customArchive]);
      const installRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "widgetctl-install-"),
      );
      try {
        const r = spawnSync(
          binary,
          [
            "--config",
            installRoot,
            "--assets",
            assets,
            "templates",
            "install",
            customArchive,
            "--json",
          ],
          { encoding: "utf8" },
        );
        assert.equal(r.status, 0, r.stdout);
        assert.equal(JSON.parse(r.stdout).data.id, "user.rose");
      } finally {
        fs.rmSync(installRoot, { recursive: true, force: true });
      }
      const created = run([
        "widgets",
        "create",
        "--template",
        "builtin.gift-alert",
        "--name",
        "RoseAlert",
      ]).data;
      const id = created.id;
      assert.equal(run(["widgets", "list"]).data.length, 1);
      assert.equal(run(["widgets", "show", id]).data.id, id);
      assert.equal(run(["widgets", "project", "get", id]).data.id, id);
      run([
        "widgets",
        "project",
        "set",
        id,
        "--set",
        'events=["gift"]',
        "--dry-run",
      ]);
      assert.ok(
        run(["widgets", "files", "list", id]).data.includes("src/main.js"),
      );
      const original = run(["widgets", "files", "read", id, "src/index.html"])
        .data.text;
      assert.equal(
        run(["widgets", "settings", "get", id]).data.settings.name,
        "RoseAlert",
      );
      let rev = run([
        "widgets",
        "settings",
        "set",
        id,
        "--set",
        "color=#ff77cc",
        "--if-revision",
        created.revision,
      ]).data.revision;
      assert.equal(
        run(
          [
            "widgets",
            "settings",
            "set",
            id,
            "--set",
            "color=red",
            "--if-revision",
            created.revision,
          ],
          3,
        ).error.code,
        "REVISION_CONFLICT",
      );
      const edited = path.join(root, "edited.html");
      fs.writeFileSync(
        edited,
        original.replace('<main id="root">', '<main id="root">Edited Ω'),
      );
      rev = run([
        "widgets",
        "files",
        "write",
        id,
        "src/index.html",
        "--from-file",
        edited,
        "--if-revision",
        rev,
      ]).data.revision;
      const css = path.join(root, "style.css");
      fs.writeFileSync(css, "body { color: red; }\r\n");
      run([
        "widgets",
        "files",
        "write",
        id,
        "src/test.css",
        "--from-file",
        css,
        "--if-revision",
        rev,
      ]);
      run([
        "widgets",
        "files",
        "rename",
        id,
        "src/test.css",
        "--to",
        "src/renamed.css",
      ]);
      run(["widgets", "files", "remove", id, "src/renamed.css"]);
      run(["widgets", "files", "mkdir", id, "src/nested"]);
      run(["widgets", "assets", "import", id, css, "--as", "assets/theme.css"]);
      run(["widgets", "validate", id]);
      run(["widgets", "build", id]);
      const published = run(["widgets", "publish", id]).data;
      assert.equal(published.status, "published");
      const loader = fs.readFileSync(
        path.join(root, "widgets", id, "index.html"),
        "utf8",
      );
      let navigated = "";
      const location = {
        href: "http://absolute/" + path.join(root, "widgets", id, "index.html"),
        hash: "",
        replace: (url) => (navigated = url),
      };
      vm.runInNewContext(loader.match(/<script>([\s\S]*?)<\/script>/)[1], {
        URL,
        location,
      });
      assert.match(navigated, /^http:\/\/absolute\/.*runtime\/.*releases\//);
      assert.ok(!loader.includes("file://"));

      run([
        "widgets",
        "preview",
        id,
        "--event",
        "gift",
        "--user",
        "Viewer123",
        "--gift",
        "Rose",
        "--count",
        "23",
      ]);
      const duplicate = run(["widgets", "duplicate", id]).data;
      assert.notEqual(duplicate.id, id);
      assert.notEqual(run(["widgets", "fork", id]).data.id, id);
      const history = run(["widgets", "history", id]).data;
      assert.ok(history.length > 0);
      run(["widgets", "rollback", id, "--revision", created.revision]);
      const project = path.join(root, "project.tiktokwidget");
      run(["widgets", "export", id, "--output", project]);
      assert.notEqual(run(["widgets", "import", project]).data.id, id);
      const formatted = run(
        ["widgets", "files", "format", id, "src/main.js", "--check"],
        4,
      );
      assert.equal(formatted.error.code, "FORMAT_DIFFERENCE");
      run(["widgets", "files", "format", id, "src/main.js"]);
      run(["widgets", "files", "format", id, "src/main.js", "--check"]);
      run(["widgets", "validate", id]);
      run([
        "widgets",
        "project",
        "set",
        id,
        "--set",
        'events=["gift"]',
        "--if-revision",
        run(["widgets", "show", id]).data.revision,
      ]);
      for (const command of [
        ["obs", "status"],
        ["obs", "scenes", "list"],
        ["obs", "sources", "list"],
        ["obs", "sources", "add", id, "--scene", "Scene"],
        ["obs", "sources", "refresh", id],
        ["obs", "sources", "remove", id, "--scene", "Scene"],
      ])
        assert.equal(run(command, 4).error.code, "OBS_OFFLINE");
      const before = run(["widgets", "list"]).data.length;
      run(["widgets", "delete", duplicate.id, "--dry-run"]);
      assert.equal(run(["widgets", "list"]).data.length, before);
      assert.equal(
        run(["widgets", "delete", duplicate.id], 4).error.code,
        "CONFIRM_REQUIRED",
      );
      run(["widgets", "delete", duplicate.id, "--confirm"]);
      assert.ok(
        fs.existsSync(
          path.join(root, "projects", duplicate.id, "src/index.html"),
        ),
      );
      run(["migration", "report"]);
      run(["migration", "apply", "--dry-run"]);
      assert.equal(
        run(["migration", "rollback"], 4).error.code,
        "BACKUP_NOT_FOUND",
      );
      const help = spawnSync(binary, ["--help"], { encoding: "utf8" });
      assert.equal(help.status, 0);
      assert.match(help.stdout, /widgets.publish/);
      assert.equal(
        spawnSync(binary, ["--version"], { encoding: "utf8" }).stdout.trim(),
        "widgetctl 3.0.0 API 1",
      );
      assert.equal(run(["unknown"], 4).error.code, "UNKNOWN_METHOD");
      const version = JSON.parse(
        spawnSync(binary, ["--version", "--json"], { encoding: "utf8" }).stdout,
      );
      assert.equal(version.data.version, "3.0.0");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
