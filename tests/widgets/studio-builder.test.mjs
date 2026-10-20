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
  "real Studio browser accessibility, drafts, conflict, schema and secure adapter",
  { skip: !fs.existsSync(server) || !browserPath, timeout: 120000 },
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
      assert.equal(
        (
          await fetch(origin + "/session", {
            method: "POST",
            headers: { Origin: origin },
            body: "",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(origin + "/session", {
            method: "POST",
            headers: { Origin: origin, Cookie: cookie },
            body: "",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(origin + "/session", {
            method: "POST",
            headers: { Origin: "https://hostile.example", Cookie: cookie },
            body: "",
          })
        ).status,
        403,
      );
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
      assert.equal(
        (await api("studio.preferences.set", { locale: "pt", theme: "light" }))
          .error.code,
        "INVALID_PREFERENCE",
      );
      assert.equal(
        (await api("studio.preferences.set", { locale: "en", theme: "system" }))
          .ok,
        true,
      );
      assert.equal((await api("studio.preferences.get")).data.locale, "en");
      const page = await browser.newPage({
        locale: "en-US",
        viewport: { width: 1440, height: 1000 },
      });
      await page.goto(url);
      await page
        .getByRole("heading", { name: "Templates", exact: true })
        .waitFor();
      await page.getByLabel("Search templates").fill("Gift Alert");
      await page.getByRole("button", { name: "Use template" }).click();
      await page.getByRole("tab", { name: "Code", exact: true }).click();
      await page
        .getByRole("button", { name: "src/main.js", exact: true })
        .click();
      await page.locator(".cm-content").waitFor();
      // Every icon-only action exposes a label, title and a hover/focus tooltip.
      const buttons = page.locator(".action-wrap button");
      for (let i = 0; i < (await buttons.count()); i++) {
        const b = buttons.nth(i);
        assert.ok(await b.getAttribute("aria-label"));
        assert.ok(await b.getAttribute("aria-description"));
        assert.equal(await b.getAttribute("title"), null);
        if ((await b.isEnabled()) && (await b.isVisible())) {
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
        if (!(await disabledActions.nth(i).isVisible())) continue;
        await disabledActions.nth(i).focus();
        await page.getByRole("tooltip").waitFor();
      }
      const project = (await api("widgets.list")).data[0];
      const original = "// Static JavaScript editing fixture\n";
      // Atomic formatter save refreshes a clean buffer without creating a conflict.
      const mainPath = path.join(root, "projects", project.id, "src/main.js");
      fs.writeFileSync(
        mainPath + ".tmp",
        original.replaceAll("\n", "\r\n") + "\r\n// formatted externally",
      );
      fs.renameSync(mainPath + ".tmp", mainPath);
      await page.waitForFunction(() =>
        document
          .querySelector(".cm-content")
          ?.textContent.includes("formatted externally"),
      );
      assert.equal(
        await page
          .getByText("External change detected. Draft retained.")
          .count(),
        0,
      );
      await page.locator(".cm-content").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\n// Local draft");
      await page.getByText(/Unsaved draft/).waitFor();
      await page.reload();
      await page.locator(".cm-content").waitFor();
      assert.match(
        await page.locator(".cm-content").textContent(),
        /Local draft/,
      );
      const external = path.join(root, "external.ts");
      fs.writeFileSync(
        external,
        fs.readFileSync(mainPath, "utf8") + "\n// External edit",
      );
      const rev = run(root, ["widgets", "show", project.id]).data.revision;
      assert.equal(
        run(root, [
          "widgets",
          "files",
          "write",
          project.id,
          "src/main.js",
          "--from-file",
          external,
          "--if-revision",
          rev,
        ]).ok,
        true,
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
          path.join(root, "projects", project.id, "src/main.js"),
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
      await page.locator(".cm-content").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("// Undo fixture");
      const savedCode = await page.locator(".cm-content").textContent();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      assert.notEqual(
        await page.locator(".cm-content").textContent(),
        savedCode,
      );
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      assert.equal(await page.locator(".cm-content").textContent(), savedCode);
      await page
        .getByRole("button", { name: "Save source", exact: true })
        .click();
      await page.getByText(/Source saved/).waitFor();
      await page.getByRole("tab", { name: "Design", exact: true }).click();
      assert.equal(await page.locator("input[type=color]").count(), 1);
      await page
        .getByLabel("Custom CSS", { exact: true })
        .fill("/* Studio authored */");
      await page
        .getByRole("button", { name: "Save appearance", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Appearance saved" })
        .waitFor();
      assert.equal(
        (await api("widgets.show", { id: project.id })).data.settings.customCss,
        "/* Studio authored */",
      );
      if (process.env.WIDGET_BUILDER_TEST === "1") {
        assert.equal(run(root, ["builders", "install", "--confirm"]).ok, true);
        await page
          .getByRole("button", { name: "Publish", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: "publish completed" })
          .waitFor();
        const active = fs.readFileSync(
          path.join(root, "widgets", project.id, "index.html"),
        );
        const layer = page.getByRole("button", {
          name: "Select Gift alert",
          exact: true,
        });
        await layer.waitFor();
        const box = await layer.boundingBox();
        await page.mouse.move(box.x + 30, box.y + 30);
        await page.mouse.down();
        await page.mouse.move(box.x + 62, box.y + 54);
        await page.mouse.up();
        assert.equal(
          (await api("widgets.show", { id: project.id })).data.settings.x,
          0,
        );
        await page
          .getByRole("button", { name: "Undo design", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Redo design", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Save design", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: "Save design completed" })
          .waitFor();
        assert.equal(
          (await api("widgets.show", { id: project.id })).data.settings.x,
          32,
        );
        assert.deepEqual(
          fs.readFileSync(path.join(root, "widgets", project.id, "index.html")),
          active,
        );
        await layer.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await page.getByLabel("x", { exact: true }).inputValue(),
          "33",
        );
        const inner = page
          .frameLocator('iframe[title="Isolated widget preview"]')
          .frameLocator("#preview");
        await inner.getByText("Studio authored").waitFor();
        // Resize is a draft and must not publish to the stable loader.
        const resize = page.getByRole("button", {
          name: "Resize Gift alert",
          exact: true,
        });
        const r = await resize.boundingBox();
        await page.mouse.move(r.x + 5, r.y + 5);
        await page.mouse.down();
        await page.mouse.move(r.x + 21, r.y + 21);
        await page.mouse.up();
        assert.equal(
          (await api("widgets.show", { id: project.id })).data.settings.width,
          600,
        );
        await page
          .getByRole("button", { name: "Save design", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: "Save design completed" })
          .waitFor();
      }

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
      await page.getByRole("button", { name: "New file", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("textbox")
        .fill("src/undo-test.js");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Continue" })
        .click();
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
        path: process.env.UI_SCREENSHOT_DIR
          ? process.env.UI_SCREENSHOT_DIR + "/workspace-code.png"
          : "docs/studio/workspace-v4.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("tab", { name: "Code", exact: true }).click();
      assert.equal(
        await page
          .locator(".workspace")
          .getAttribute("data-panel-group-direction"),
        "horizontal",
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
