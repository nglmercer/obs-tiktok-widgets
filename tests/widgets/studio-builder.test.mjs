import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
const cli = process.env.WIDGETCTL || "build_flatpak/widgetctl",
  server = process.env.WIDGETSTUDIO || "build_flatpak/widgetstudio",
  browserPath = process.env.PLAYGROUND_BROWSER_EXECUTABLE;
const run = (root, args) => {
  const r = spawnSync(
    cli,
    ["--config", root, "--assets", path.resolve("data/web"), ...args, "--json"],
    { encoding: "utf8" },
  );
  assert.ok(r.stdout, r.stderr);
  return JSON.parse(r.stdout);
};
test(
  "v3 builders consent, offline compile, TS diagnostics, lock policy and immutable last-good",
  {
    skip: !fs.existsSync(cli) || !process.env.WIDGET_BUILDER_TEST,
    timeout: 180000,
  },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "widget-builder-"));
    try {
      assert.equal(
        run(root, ["builders", "install"]).error.code,
        "CONSENT_REQUIRED",
      );
      assert.equal(run(root, ["builders", "install", "--confirm"]).ok, true);
      for (const template of [
        "builtin.typescript-vanilla",
        "builtin.react-typescript",
      ]) {
        const created = run(root, [
          "widgets",
          "create",
          "--template",
          template,
        ]);
        assert.equal(created.ok, true);
        const id = created.data.id;
        assert.equal(created.data.autoPublish, false);
        const source = path.join(root, "projects", id, "src");
        const before = fs.readFileSync(path.join(source, "index.html"));
        fs.mkdirSync(path.join(root, "projects", id, "assets"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(root, "projects", id, "assets", "tone.wav"),
          "local-audio-fixture",
        );
        assert.equal(
          run(root, [
            "widgets",
            "settings",
            "set",
            id,
            "--set",
            "soundUrl=../assets/tone.wav",
          ]).ok,
          true,
        );
        const published = run(root, ["widgets", "publish", id]);
        assert.equal(published.ok, true, JSON.stringify(published));
        assert.deepEqual(
          fs.readFileSync(path.join(source, "index.html")),
          before,
        );
        assert.equal(
          fs.readFileSync(
            path.join(published.data.release, "dist/assets/tone.wav"),
            "utf8",
          ),
          "local-audio-fixture",
        );
        const pointer = fs.readFileSync(
          path.join(root, "widgets", id, "index.html"),
        );
        const main = path.join(
          source,
          template.includes("react") ? "main.tsx" : "main.ts",
        );
        const original = fs.readFileSync(main, "utf8");
        fs.appendFileSync(main, '\nconst invalid: number = "wrong";');
        const failed = run(root, ["widgets", "publish", id]);
        assert.equal(failed.error.code, "COMPILE_ERROR");
        assert.match(failed.error.message, /main\.tsx?.*error TS2322/s);
        assert.deepEqual(
          fs.readFileSync(path.join(root, "widgets", id, "index.html")),
          pointer,
        );
        fs.writeFileSync(main, original);
        fs.appendFileSync(path.join(source, "package-lock.json"), " ");
        assert.equal(
          run(root, ["widgets", "publish", id]).error.code,
          "DEPENDENCY_POLICY",
        );
        fs.copyFileSync(
          "data/web/builder/package-lock.json",
          path.join(source, "package-lock.json"),
        );
        const refreshed = run(root, ["widgets", "publish", id]);
        assert.equal(refreshed.ok, true, JSON.stringify(refreshed));
        const missingNode = spawnSync(
          cli,
          [
            "--config",
            root,
            "--assets",
            path.resolve("data/web"),
            "widgets",
            "publish",
            id,
            "--json",
          ],
          { env: { PATH: "/nonexistent" }, encoding: "utf8" },
        );
        assert.equal(
          JSON.parse(missingNode.stdout).error.code,
          "BUILD_TOOL_REQUIRED",
        );
        fs.appendFileSync(
          main,
          "\nimport 'https://example.invalid/remote.js';",
        );
        assert.match(
          run(root, ["widgets", "publish", id]).error.message,
          /Unsupported dependency or import protocol/,
        );
        fs.writeFileSync(main, original);
        fs.writeFileSync(
          path.join(source, "dynamic.ts"),
          'export const marker="dynamic-ready";',
        );
        fs.appendFileSync(
          main,
          "\nimport('./dynamic').then(({marker})=>document.getElementById('root')!.setAttribute('data-dynamic',marker));",
        );
        assert.equal(run(root, ["widgets", "publish", id]).ok, true);

        const latest = fs.readFileSync(main, "utf8");
        const currentPointer = fs.readFileSync(
          path.join(root, "widgets", id, "index.html"),
        );
        const pending = spawn(cli, [
          "--config",
          root,
          "--assets",
          path.resolve("data/web"),
          "widgets",
          "publish",
          id,
          "--json",
        ]);
        let result = "";
        pending.stdout.on("data", (d) => (result += d));
        const done = new Promise((resolve) => pending.on("exit", resolve));
        await new Promise((resolve) => setTimeout(resolve, 350));
        fs.appendFileSync(main, "\n// External save during compilation");
        await done;
        assert.equal(JSON.parse(result).error.code, "REVISION_CONFLICT");
        assert.deepEqual(
          fs.readFileSync(path.join(root, "widgets", id, "index.html")),
          currentPointer,
        );
        fs.writeFileSync(main, latest);
        if (browserPath) {
          const browser = await chromium.launch({
            executablePath: browserPath,
            headless: true,
            args: ["--no-sandbox"],
          });
          try {
            const page = await browser.newPage();
            const preview = run(root, ["widgets", "preview", id]);
            assert.equal(preview.ok, true);
            await page.goto(preview.data.url);
            await page.waitForFunction(
              () => !document.querySelector("#replay").disabled,
            );
            const frame = page.frameLocator("iframe");
            await frame
              .locator("#gift")
              .filter({ hasText: "23 Rose" })
              .waitFor();
            await frame
              .locator('#root[data-dynamic="dynamic-ready"]')
              .waitFor();
            assert.equal(
              await frame.locator("#gift").textContent(),
              "Viewer123 sends 23 Rose",
            );
            await page.locator("#streak").click();
            await frame
              .locator("#gift")
              .filter({ hasText: "23 Rose" })
              .waitFor();
            assert.ok(
              !(await frame.locator("#gift").textContent()).includes("29"),
            );
          } finally {
            await browser.close();
          }
        }
      }
      const bad = run(root, [
        "widgets",
        "create",
        "--template",
        "builtin.custom",
      ]).data;
      assert.equal(
        run(root, [
          "widgets",
          "project",
          "set",
          bad.id,
          "--set",
          'build={"mode":"vite","framework":"vue"}',
        ]).error.code,
        "UNSUPPORTED_BUILDER",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
test(
  "real Studio browser accessibility, drafts, conflict, schema and secure adapter",
  { skip: !fs.existsSync(server) || !browserPath, timeout: 60000 },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "widget-studio-"));
    const child = spawn(
      server,
      ["--confirm", "--config", root, "--assets", path.resolve("data/web")],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const url = await new Promise((resolve, reject) => {
      child.stdout.once("data", (d) => {
        try {
          resolve(JSON.parse(String(d)).data.url);
        } catch (e) {
          reject(e);
        }
      });
      child.once("exit", () => reject(new Error(stderr)));
    });
    const origin = new URL(url).origin,
      secret = new URL(url).hash.slice(1);
    const browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      assert.equal(
        (
          await fetch(origin + "/api", {
            method: "POST",
            headers: { Origin: origin },
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(origin + "/session", {
            method: "POST",
            headers: { Origin: "https://hostile.example" },
            body: secret,
          })
        ).status,
        403,
      );
      const session = await fetch(origin + "/session", {
        method: "POST",
        headers: { Origin: origin },
        body: secret,
      });
      const cookie = session.headers.get("set-cookie").split(";")[0];
      const api = async (method, args = {}) => {
        const r = await fetch(origin + "/api", {
          method: "POST",
          headers: {
            Origin: origin,
            Cookie: cookie,
            "X-Studio-Session": secret,
          },
          body: JSON.stringify({ method, args }),
        });
        return r.json();
      };
      assert.equal(
        (await api("builders.install", { confirm: true })).error.code,
        "FORBIDDEN_METHOD",
      );
      assert.equal(
        (await api("obs.shutdown", { confirm: true })).error.code,
        "FORBIDDEN_METHOD",
      );
      assert.equal((await api("obs.status")).error.code, "OBS_OFFLINE");
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.goto(url);
      await page
        .getByRole("heading", { name: "Templates", exact: true })
        .waitFor();
      await page.getByLabel("Search templates").fill("TypeScript Gift");
      await page.getByRole("button", { name: "Use template" }).click();
      await page.getByRole("tab", { name: "Code", exact: true }).click();
      await page
        .getByRole("button", { name: "src/main.ts", exact: true })
        .click();
      await page.locator(".cm-content").waitFor();
      // Every icon-only action exposes a label, title and a hover/focus tooltip.
      const buttons = page.locator(".action-wrap button");
      for (let i = 0; i < (await buttons.count()); i++) {
        const b = buttons.nth(i);
        assert.ok(await b.getAttribute("aria-label"));
        assert.ok(await b.getAttribute("title"));
        if (await b.isEnabled()) {
          await b.hover();
          await page.getByRole("tooltip").waitFor();
          await page.mouse.move(0, 0);
          await b.blur();
          await b.focus();
          await page.getByRole("tooltip").waitFor();
          assert.equal(
            await b.evaluate((el) => document.activeElement === el),
            true,
          );
        }
      }
      const disabledActions = page.locator('.action-wrap[tabindex="0"]');
      for (let i = 0; i < (await disabledActions.count()); i++) {
        await disabledActions.nth(i).focus();
        await page.getByRole("tooltip").waitFor();
      }
      const project = (await api("widgets.list")).data[0];
      const original = fs.readFileSync(
        path.join(root, "projects", project.id, "src/main.ts"),
        "utf8",
      );
      await page.locator(".cm-content").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\n// Local draft");
      await page.getByText(/Unsaved draft/).waitFor();
      fs.appendFileSync(
        path.join(root, "projects", project.id, "src/main.ts"),
        "\n// External edit",
      );
      await page
        .getByText("External change detected. Draft retained.")
        .waitFor();
      assert.match(
        await page.locator(".cm-content").textContent(),
        /Local draft/,
      );
      await page
        .getByRole("button", { name: "Save source", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "REVISION_CONFLICT" })
        .waitFor();
      assert.match(
        fs.readFileSync(
          path.join(root, "projects", project.id, "src/main.ts"),
          "utf8",
        ),
        /External edit/,
      );
      await page
        .getByRole("button", { name: "Keep draft for manual merge" })
        .click();
      await page
        .getByRole("button", { name: "Save source", exact: true })
        .click();
      await page.getByText(/Source saved/).waitFor();
      await page.getByRole("tab", { name: "Design", exact: true }).click();
      assert.equal(await page.locator("input[type=color]").count(), 1);
      await page.getByLabel("Heading", { exact: true }).fill("Studio authored");
      await page
        .getByRole("button", { name: "Save appearance", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Appearance saved" })
        .waitFor();
      assert.equal(
        (await api("widgets.show", { id: project.id })).data.settings.title,
        "Studio authored",
      );
      assert.equal(
        (
          await api("widgets.files.write", {
            id: project.id,
            file: "src/../../outside.js",
            text: "bad",
            ifRevision: (await api("widgets.show", { id: project.id })).data
              .revision,
          })
        ).ok,
        false,
      );
      page.once("dialog", (dialog) => dialog.accept("src/undo-test.js"));
      await page.getByRole("button", { name: "New file", exact: true }).click();
      await page
        .getByRole("button", { name: "src/undo-test.js", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page
        .getByRole("button", { name: "src/undo-test.js", exact: true })
        .waitFor({ state: "detached" });
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      await page
        .getByRole("button", { name: "src/undo-test.js", exact: true })
        .waitFor();
      await page.screenshot({
        path: "docs/studio/workspace.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("tab", { name: "Code", exact: true }).click();
      assert.equal(
        await page
          .locator(".workspace")
          .getAttribute("data-panel-group-direction"),
        "vertical",
      );
      assert.equal(
        await page.evaluate(() => document.compatMode),
        "CSS1Compat",
      );
    } finally {
      await browser.close();
      child.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
