import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const cli = process.env.WIDGETCTL,
  helper = process.env.WIDGETSTUDIO,
  browserPath = process.env.PLAYGROUND_BROWSER_EXECUTABLE;
const assets = path.resolve("data/web");
const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
function command(root, args, extra = {}) {
  const result = spawnSync(
    cli,
    ["--config", root, "--assets", assets, ...args, "--json"],
    { encoding: "utf8", ...extra },
  );
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.ok, true, JSON.stringify(packet));
  return packet.data;
}
async function start(root) {
  const process = spawn(
    helper,
    ["--confirm", "--config", root, "--assets", assets],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  process.stderr.on("data", (chunk) => (stderr += chunk));
  const url = await new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(
      () => reject(new Error("Studio startup timeout")),
      10000,
    );
    process.stdout.on("data", (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end >= 0) {
        clearTimeout(timeout);
        const packet = JSON.parse(buffer.slice(0, end));
        if (!packet.ok) reject(new Error("Studio startup failed"));
        else resolve(packet.data.url);
      }
    });
    process.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Studio exited before startup " + stderr));
    });
  });
  return { process, url };
}
async function stop(process) {
  if (process.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => process.kill("SIGKILL"), 2000);
    process.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    process.kill("SIGTERM");
  });
}
test("shared locale catalogs, placeholder validation, preference persistence and plural formatting", async () => {
  const result = spawnSync("node", ["tools/check-locales.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "widget-locale-"));
  try {
    await build({
      entryPoints: ["web/shared/i18n/index.ts"],
      outfile: path.join(root, "i18n.mjs"),
      bundle: true,
      format: "esm",
    });
    const locale = await import(
      pathToFileURL(path.join(root, "i18n.mjs")).href
    );
    locale.setLocale("es");
    assert.equal(locale.t("Publish"), "Publicar");
    assert.equal(
      locale.t("Select {label}", { label: "Rose" }),
      "Seleccionar Rose",
    );
    assert.equal(locale.eventCount(1), "1 evento");
    assert.equal(locale.eventCount(23), "23 eventos");
    locale.setLocale("en");
    assert.equal(locale.t("Publish"), "Publish");
    assert.equal(locale.t("unknown-custom-key"), "unknown-custom-key");
    assert.ok(locale.missingKeys.has("unknown-custom-key"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test(
  "Studio responsive themes, English/Spanish keyboard navigation, automatic published preview and persistent drafts",
  { skip: !cli || !helper || !browserPath, timeout: 180000 },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "widget-ui-v4-"));
    let server, browser;
    try {
      const widget = command(root, [
        "widgets",
        "create",
        "--template",
        "builtin.gift-alert",
        "--name",
        "V4 static fixture",
      ]);
      command(root, ["widgets", "publish", widget.id], {
        env: {
          ...process.env,
          PATH:
            process.platform === "win32"
              ? process.env.PATH.split(path.delimiter)
                  .filter((dir) => !fs.existsSync(path.join(dir, "node.exe")))
                  .join(path.delimiter)
              : "/nonexistent",
        },
      });
      server = await start(root);
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ["--no-sandbox"],
      });
      const context = await browser.newContext({ locale: "en-US" });
      const page = await context.newPage();
      const url = new URL(server.url);
      url.searchParams.set("widget", widget.id);
      await page.goto(url.href);
      await page.getByRole("tab", { name: "Design", exact: true }).waitFor();
      await page.locator("iframe[data-widget-preview]").waitFor();
      const widgetTheme = String(widget.settings.theme);
      assert.equal(
        await page
          .locator(".inspector")
          .getByLabel("Theme", { exact: true })
          .inputValue(),
        widgetTheme,
      );
      const capture = process.env.UI_SCREENSHOT_DIR;
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(400);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Studio overflow at ${width}`,
        );
        assert.equal(
          await page.locator("iframe[data-widget-preview]").count(),
          1,
        );
        if (capture && [320, 768, 1440].includes(width)) {
          fs.mkdirSync(capture, { recursive: true });
          await page.screenshot({
            path: path.join(capture, `studio-v4-en-${width}.png`),
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByLabel("Language", { exact: true }).selectOption("es");
      await page.getByRole("tab", { name: "Diseño", exact: true }).waitFor();
      assert.equal(
        await page
          .locator(".inspector")
          .getByLabel("Tema", { exact: true })
          .inputValue(),
        widgetTheme,
        "Locale changes must preserve machine-readable settings values",
      );
      await page
        .locator(".navigation")
        .getByLabel("Tema", { exact: true })
        .selectOption("light");
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.theme),
        "light",
      );
      await page.getByRole("tab", { name: "Código", exact: true }).click();
      await page
        .getByRole("button", { name: "src/index.html", exact: true })
        .click();
      await page.getByLabel("Editor de código", { exact: true }).waitFor();
      await page.getByLabel("Editor de código", { exact: true }).click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("<!-- V4 draft remains local -->");
      const source = command(root, [
        "widgets",
        "files",
        "read",
        widget.id,
        "src/index.html",
      ]).text;
      assert.ok(!source.includes("V4 draft remains local"));
      await page.reload();
      await page.getByLabel("Editor de código", { exact: true }).waitFor();
      assert.ok(
        (await page.locator(".cm-content").textContent()).includes(
          "V4 draft remains local",
        ),
      );
      assert.equal(
        await page.getByLabel("Idioma", { exact: true }).inputValue(),
        "es",
      );
      assert.match(
        fs.readFileSync(path.join(root, "ui-preferences.ini"), "utf8"),
        /locale=es/,
      );
      if (capture)
        await page.screenshot({
          path: path.join(capture, "studio-v4-es-1440.png"),
        });
      await page.locator(".context-menu summary").focus();
      await page.keyboard.press("ArrowDown");
      assert.ok(await page.locator(".context-menu").evaluate((el) => el.open));
      await page.keyboard.press("Escape");
      assert.ok(
        !(await page.locator(".context-menu").evaluate((el) => el.open)),
      );
      await page.getByLabel("Idioma", { exact: true }).selectOption("en");
      await page
        .locator(".navigation")
        .getByLabel("Theme", { exact: true })
        .selectOption("system");
      await page.setViewportSize({ width: 768, height: 900 });
      await page
        .getByRole("button", { name: "Inspector", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Appearance", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Files", exact: true }).click();
      await page.getByLabel("Search files").fill("index");
      assert.equal(
        await page
          .getByRole("button", { name: "src/index.html", exact: true })
          .count(),
        1,
      );
      await page
        .locator(".panel-switch")
        .getByRole("button", { name: "Preview", exact: true })
        .click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page.evaluate(
          () =>
            getComputedStyle(document.querySelector("button"))
              .transitionDuration,
        ),
        "0s",
      );
      await page.setViewportSize({ width: 640, height: 450 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "200%-equivalent viewport overflow",
      );
    } finally {
      await browser?.close();
      if (server) await stop(server.process);
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
test(
  "standalone file Playground mobile layouts, runtime Spanish and isolated cumulative Rose 23",
  { skip: !cli || !browserPath, timeout: 120000 },
  async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "widget-playground-v4-"),
    );
    let browser;
    try {
      const widget = command(root, [
        "widgets",
        "create",
        "--template",
        "builtin.gift-alert",
      ]);
      command(root, ["widgets", "publish", widget.id]);
      const preview = command(root, ["widgets", "preview", widget.id]);
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage({ locale: "en-US" });
      await page.goto(preview.url);
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
      const frame = page.frameLocator("#preview");
      await frame.locator("#root").filter({ hasText: "23" }).waitFor();
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `Playground overflow ${width}`,
        );
      }
      await page.locator("#language").selectOption("es");
      assert.equal(await page.locator("#replay").textContent(), "Reproducir");
      await page.locator("#streak").check();
      await page.locator("#interval").fill("10");
      await page.locator("#replay").click();
      await page.waitForTimeout(200);
      assert.ok((await frame.locator("body").textContent()).includes("23"));
      assert.ok(!(await frame.locator("body").textContent()).includes("29"));
      await page.locator("#type").selectOption("chat");
      assert.ok(await page.locator("#gift-controls").isHidden());
      await page.locator("#type").selectOption("gift");
      assert.ok(await page.locator("#gift-controls").isVisible());
      await page.locator("#theme").selectOption("light");
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.theme),
        "light",
      );
      await page.locator(".json-inspector summary").click();
      assert.ok(await page.locator("#json").isVisible());
      const capture = process.env.UI_SCREENSHOT_DIR;
      if (capture) {
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({
            path: path.join(capture, `playground-v4-es-${width}.png`),
          });
        }
      }
      await page.reload();
      assert.equal(await page.locator("#language").inputValue(), "es");
      await page.locator("#reset").click();
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
      assert.equal(await page.locator("#history li").count(), 0);
    } finally {
      await browser?.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "declarative canvas component fit, pointer drag/resize, keyboard and checkpoint undo",
  { skip: !browserPath, timeout: 60000 },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "widget-canvas-v4-"));
    let browser;
    try {
      await build({
        stdin: {
          contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{Canvas}from'./web/studio/features/Canvas';import{Layers}from'./web/studio/features/Layers';function Test(){const[settings,setSettings]=useState({x:16,y:16,width:120,height:80}),[selected,setSelected]=useState(''),[past,setPast]=useState([]);const components=[{id:'alert',label:'Alert layer',properties:['x','y','width','height'],bindings:{x:'x',y:'y',width:'width',height:'height'}}];window.values=settings;window.checkpoints=past.length;return <><button onClick={()=>{setSettings(past.at(-1));setPast(past.slice(0,-1))}}>Undo gesture</button><Layers components={components} selected={selected} onSelect={setSelected}/><div style={{width:600}}><Canvas preview="about:blank?fixture=1" viewport="600×400" components={components} selected={selected} onSelect={setSelected} settings={settings} onChange={(value,checkpoint=true)=>{if(checkpoint)setPast(p=>[...p,settings]);setSettings(value)}} session="test-only"/></div></>}createRoot(document.getElementById('root')).render(<Test/>);`,
          resolveDir: process.cwd(),
          loader: "tsx",
        },
        bundle: true,
        jsx: "automatic",
        format: "iife",
        outfile: path.join(root, "test.js"),
        define: { "process.env.NODE_ENV": '"production"' },
      });
      fs.writeFileSync(
        path.join(root, "index.html"),
        '<!doctype html><html><head><style>.visual-canvas{position:relative}.visual-component{position:absolute;touch-action:none;border:1px solid}.resize-handle{position:absolute;bottom:0;right:0;width:14px;height:14px}.canvas-scroll{overflow:auto}</style></head><body><div id="root"></div><script src="test.js"></script></body></html>',
      );
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage({ locale: "en-US" });
      await page.goto(pathToFileURL(path.join(root, "index.html")).href);
      await page
        .getByRole("button", { name: "Select Alert layer", exact: true })
        .waitFor();
      const overlay = page.getByRole("button", {
        name: "Select Alert layer",
        exact: true,
      });
      let box = await overlay.boundingBox();
      await page.mouse.move(box.x + 30, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 62, box.y + 46);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.values.x), 48);
      assert.equal(await page.evaluate(() => window.values.y), 32);
      assert.equal(await page.evaluate(() => window.checkpoints), 1);
      await page.getByRole("button", { name: "Undo gesture" }).click();
      assert.equal(await page.evaluate(() => window.values.x), 16);
      await overlay.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(() => window.values.x), 17);
      const handle = page.getByLabel("Resize Alert layer", { exact: true });
      box = await handle.boundingBox();
      await page.mouse.move(box.x + 5, box.y + 5);
      await page.mouse.down();
      await page.mouse.move(box.x + 37, box.y + 21);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.values.width), 152);
      assert.equal(await page.evaluate(() => window.values.height), 96);
      await page
        .getByRole("treeitem", { name: "Alert layer", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("treeitem", { name: "Alert layer", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
    } finally {
      await browser?.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
