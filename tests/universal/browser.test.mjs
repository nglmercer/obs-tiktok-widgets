import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const sdk = resolve("web/universal/editor-ui.js");
const sibling = resolve("../TikTools-app/src/universal/editor-ui.js");
const packageRoot = resolve("data/web/templates/universal.gift-alert/1.0.0");
test(
  "published native universal package retains the isolated v1 Playground preview",
  { skip: !process.env.WIDGETCTL },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "universal-preview-"));
    const browser = await chromium.launch();
    const command = (...args) => {
      const result = spawnSync(
        process.env.WIDGETCTL,
        [
          "--config",
          directory,
          "--assets",
          resolve("data/web"),
          ...args,
          "--json",
        ],
        { encoding: "utf8", windowsHide: true },
      );
      const packet = JSON.parse(result.stdout);
      assert.equal(packet.ok, true, result.stdout);
      return packet.data;
    };
    try {
      const widget = command(
        "widgets",
        "create",
        "--template",
        "universal.gift-alert",
        "--version",
        "1.0.0",
      );
      command(
        "widgets",
        "publish",
        widget.id,
        "--if-revision",
        widget.revision,
      );
      const preview = command(
        "widgets",
        "preview",
        widget.id,
        "--event",
        "gift",
        "--user",
        "Viewer123",
        "--gift",
        "Rose",
        "--count",
        "23",
      );
      const page = await browser.newPage();
      await page.goto(preview.url);
      await page
        .frameLocator("iframe")
        .locator(".alert p")
        .filter({ hasText: "Rose × 23" })
        .waitFor();
      assert.equal(
        await page.frameLocator("iframe").locator(".alert").count(),
        1,
      );
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
test("compiled package renders safely in both shipped SDKs and projects round-trip with matching visuals", async () => {
  const sources = {};
  for (const [host, path] of [
    ["obs", sdk],
    ["tiktools", existsSync(sibling) ? sibling : sdk],
  ]) {
    const bundle = await build({
      stdin: {
        contents: `import {mountEditor} from ${JSON.stringify(path)};window.editor=mountEditor(document.getElementById('root'),{locale:'en'});`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      format: "iife",
    });
    sources[host] = bundle.outputFiles[0].text;
  }
  const server = createServer((req, res) => {
    const host = req.url.includes("tiktools") ? "tiktools" : "obs";
    res.setHeader(
      "Content-Type",
      req.url.endsWith(".js") ? "text/javascript" : "text/html",
    );
    res.end(
      req.url.endsWith(".js")
        ? sources[host]
        : `<!doctype html><html><body><div id="root"></div><script src="/${host}.js"></script></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const obs = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    obs.on("pageerror", (e) => errors.push(e.message));
    await obs.goto(origin + "/obs");
    await obs.locator("input[webkitdirectory]").setInputFiles(packageRoot);
    await obs.waitForFunction(() => window.editor.export());
    await obs.getByLabel("grid", { exact: true }).fill("16");
    await obs
      .getByRole("button", { name: "Apply settings", exact: true })
      .nth(1)
      .click();
    await obs.waitForFunction(
      () => JSON.parse(window.editor.export()).editor.grid === 16,
    );
    const event = {
      version: 1,
      id: "browser-1",
      source: "external.preview",
      type: "custom.alert",
      timestamp: "2026-10-20T14:00:00Z",
      data: {
        title: "<script>window.PWNED=1</script>",
        message: "<img src=x onerror=alert(1)>",
      },
    };
    await obs.frameLocator("iframe").locator("#root").waitFor();
    await obs.evaluate((event) => {
      window.editor.send(event);
      window.editor.send(event);
    }, event);
    await obs.frameLocator("iframe").locator(".alert").waitFor();
    assert.equal(await obs.frameLocator("iframe").locator(".alert").count(), 1);
    assert.equal(
      await obs.frameLocator("iframe").locator("h2").textContent(),
      event.data.title,
    );
    assert.equal(
      await obs.frameLocator("iframe").locator(".alert img").count(),
      0,
    );
    await obs
      .getByRole("button", { name: "Add text layer", exact: true })
      .click();
    await obs.locator("[data-layer]").waitFor();
    const before = await obs.evaluate(() => window.editor.export());
    const tik = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await tik.goto(origin + "/tiktools");
    await tik.locator("input[webkitdirectory]").setInputFiles(packageRoot);
    await tik.waitForFunction(() => window.editor.export());
    await tik
      .locator('input[accept=".json"]')
      .first()
      .setInputFiles({
        name: "project.json",
        mimeType: "application/json",
        buffer: Buffer.from(before),
      });
    await tik.waitForFunction(
      (expected) => window.editor.export() === expected,
      before,
    );
    assert.equal(await tik.locator("[data-layer]").count(), 1);
    assert.deepEqual(
      await obs.locator("[data-layer]").boundingBox(),
      await tik.locator("[data-layer]").boundingBox(),
    );
    await obs.getByRole("button", { name: "Undo", exact: true }).click();
    await obs.waitForFunction(
      () => JSON.parse(window.editor.export()).layout.layers.length === 0,
    );
    await obs.getByRole("button", { name: "Redo", exact: true }).click();
    await obs.waitForFunction(
      () => JSON.parse(window.editor.export()).layout.layers.length === 1,
    );
    for (const width of [320, 768, 1440]) {
      await tik.setViewportSize({ width, height: 900 });
      assert.equal(
        await tik.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
