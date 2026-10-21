import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const output = resolve(
  process.env.COMPOSITION_GUIDE_OUTPUT || "docs/validation/compositions",
);
const cli = process.env.WIDGETCTL || "build_compositor/widgetctl";
const helper = process.env.WIDGETSTUDIO || "build_compositor/widgetstudio";
const root = mkdtempSync(join(tmpdir(), "composition-guide-"));
mkdirSync(output, { recursive: true });
const steps = [],
  errors = [];
const command = (...args) => {
  const result = spawnSync(
    cli,
    ["--config", root, "--assets", resolve("data/web"), ...args, "--json"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.ok, true);
  return packet.data;
};
let server, browser, context, studioVideo, rendererVideo;
const report = {
  automated: true,
  humanParticipants: 0,
  platform: process.platform,
  steps,
  errors,
  passed: false,
};
async function step(name, page, action) {
  const started = performance.now();
  await action();
  await page.evaluate(() => document.fonts.ready);
  const screenshot = `${String(steps.length + 1).padStart(2, "0")}-${name}.png`;
  await page.mouse.move(5, 5);
  await page.keyboard.press("Escape");
  await page.locator(".composition-inspector").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      node.scrollTop = 0;
    }),
  );
  await page.screenshot({
    path: join(output, screenshot),
    fullPage: true,
    animations: "disabled",
  });
  steps.push({
    name,
    screenshot,
    milliseconds: Math.round(performance.now() - started),
  });
  console.log(`PASS ${name}`);
}
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
  await stopped;
  clearTimeout(timer);
}
try {
  const doctor = command("doctor");
  assert.equal(doctor.runtimeNodeRequired, false);
  assert.ok(
    command("templates", "list").some((t) => t.id === "builtin.composition"),
  );
  server = spawn(
    helper,
    ["--confirm", "--config", root, "--assets", resolve("data/web")],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stderr.on("data", () => {});
  const address = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(Error("Studio startup timeout")),
      10000,
    );
    server.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (!buffer.includes("\n")) return;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(buffer.split("\n")[0]).data.url);
      } catch (error) {
        reject(error);
      }
    });
    server.once("exit", () => {
      clearTimeout(timer);
      reject(Error("Studio exited before startup"));
    });
  });
  browser = await chromium.launch({
    executablePath: process.env.PLAYGROUND_BROWSER_EXECUTABLE || undefined,
    headless: true,
    slowMo: 100,
  });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    recordVideo: {
      dir: join(root, "recordings"),
      size: { width: 1440, height: 1000 },
    },
  });
  const page = await context.newPage();
  studioVideo = page.video();
  page.on("pageerror", (error) => errors.push(error.message));
  await step("find-composition-template", page, async () => {
    await page.goto(address);
    await page
      .getByRole("heading", { name: "Composition", exact: true })
      .waitFor();
  });
  await step("create-empty-composition", page, async () => {
    await page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: "Composition", exact: true }),
      })
      .getByRole("button", { name: "Use template", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add widget", exact: true })
      .waitFor();
  });
  const composition = command("compositions", "list")[0];
  const inspect = () => command("compositions", "get", composition.id);
  const add = page.getByRole("button", { name: "Add widget", exact: true });
  const layers = page.locator('.composition-layout aside[aria-label="Layers"]');
  await step("add-chat-and-gifts", page, async () => {
    await add.click();
    await page.getByLabel("Name", { exact: true }).fill("Chat");
    await page.getByLabel("x", { exact: true }).fill("60");
    await page.getByLabel("y", { exact: true }).fill("80");
    await page.getByLabel("height", { exact: true }).fill("650");
    await page.getByLabel("Widget template").selectOption("builtin.gift-alert");
    await add.click();
    await page.getByLabel("Name", { exact: true }).fill("Gifts");
    await page.getByLabel("x", { exact: true }).fill("650");
    await page.getByLabel("y", { exact: true }).fill("200");
    await page.getByLabel("width", { exact: true }).fill("650");
    await page
      .getByRole("status")
      .filter({ hasText: "Unsaved draft" })
      .waitFor();
    assert.equal(
      inspect().settings.composition.widgets.length,
      0,
      "draft must not be saved implicitly",
    );
  });
  await step("simulate-without-tiktok", page, async () => {
    await page
      .getByRole("button", { name: "Simulate composition", exact: true })
      .click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".composition-scroll [data-widget]")].every(
        (node) => node.shadowRoot?.querySelector(".item"),
      ),
    );
    assert.match(
      (await page.locator(".composition-scroll .item").allTextContents()).join(
        " ",
      ),
      /Rose/,
    );
  });
  await step("select-drag-and-undo", page, async () => {
    await layers.getByRole("button", { name: "Chat", exact: true }).click();
    const oldX = Number(
      await page.getByLabel("x", { exact: true }).inputValue(),
    );
    const hit = page.locator('.composition-hit[data-selected="true"]');
    const box = await hit.boundingBox();
    await page.mouse.move(box.x + 25, box.y + 25);
    await page.mouse.down();
    await page.mouse.move(box.x + 65, box.y + 45, { steps: 8 });
    await page.mouse.up();
    assert.notEqual(
      Number(await page.getByLabel("x", { exact: true }).inputValue()),
      oldX,
    );
    await page
      .getByRole("button", { name: "Undo design", exact: true })
      .click();
    assert.equal(
      Number(await page.getByLabel("x", { exact: true }).inputValue()),
      oldX,
    );
    await page
      .getByRole("button", { name: "Simulate composition", exact: true })
      .click();
  });
  const undoIcon = page.getByRole("button", {
    name: "Undo design",
    exact: true,
  });
  await undoIcon.hover();
  await page
    .getByRole("tooltip", { name: "Undo design", exact: true })
    .waitFor();
  await page.screenshot({
    path: join(output, "hover-undo-title.png"),
    fullPage: true,
  });
  await page.mouse.move(1, 1);
  await page.keyboard.press("Escape");
  await undoIcon.focus();
  await page
    .getByRole("tooltip", { name: "Undo design", exact: true })
    .waitFor();
  report.iconTooltips = {
    hover: true,
    keyboardFocus: true,
    decorativeSvg:
      (await undoIcon.locator("svg").getAttribute("aria-hidden")) === "true",
  };
  await page.keyboard.press("Escape");
  await step("visibility-and-lock", page, async () => {
    await page.getByLabel("Visible", { exact: true }).uncheck();
    await page.getByLabel("Visible", { exact: true }).check();
    await page.getByLabel("Locked", { exact: true }).check();
    assert.equal(
      await page.getByLabel("width", { exact: true }).isDisabled(),
      true,
    );
    await page.getByLabel("Locked", { exact: true }).uncheck();
  });
  const save = page.getByRole("button", { name: "Save design", exact: true });
  await step("save-draft", page, async () => {
    await save.click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Save design",
        )?.disabled,
    );
    assert.equal(inspect().settings.composition.widgets.length, 2);
  });
  await step("publish", page, async () => {
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page
      .getByRole("button", { name: "Publish", exact: true })
      .waitFor({ state: "visible" });
    // Pointer existence verifies publication independently of a UI success message.
    let pointer;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        pointer = readFileSync(
          join(root, "widgets", composition.id, "index.html"),
          "utf8",
        );
        break;
      } catch {
        await page.waitForTimeout(50);
      }
    }
    assert.match(pointer || "", /releases/);
  });
  await step("reopen-saved-composition", page, async () => {
    await page.reload();
    await page
      .getByRole("button", { name: "Simulate composition", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "All widgets", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open widget", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Simulate composition", exact: true })
      .click();
    assert.equal(inspect().settings.composition.widgets.length, 2);
  });
  await step("mobile-320", page, async () => {
    await page.setViewportSize({ width: 320, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
  });
  await step("mobile-inspector", page, async () => {
    await page
      .locator(".composition-panel-tabs")
      .getByRole("button", { name: "Layers", exact: true })
      .click();
    await layers.getByRole("button", { name: "Chat", exact: true }).click();
    await page
      .locator(".composition-panel-tabs")
      .getByRole("button", { name: "Inspector", exact: true })
      .click();
    await page.getByLabel("width", { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(
      await page.getByLabel("width", { exact: true }).isVisible(),
      true,
    );
    assert.equal(await page.locator(".composition-scroll").isVisible(), false);
  });
  await page
    .locator(".composition-panel-tabs")
    .getByRole("button", { name: "Canvas", exact: true })
    .click();
  await step("spanish-mobile", page, async () => {
    await page.locator(".nav-toggle").click();
    await page
      .getByRole("combobox", { name: "Language", exact: true })
      .first()
      .selectOption("es");
    await page.locator(".nav-toggle").click();
    await page
      .getByRole("button", { name: "Simular composición", exact: true })
      .waitFor();
  });
  await step("spanish-desktop", page, async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "Simular composición", exact: true })
      .click();
  });
  await page.close();
  await stopServer();
  await context.setOffline(true);
  const production = await context.newPage();
  rendererVideo = production.video();
  await step("published-renderer-studio-closed", production, async () => {
    await production.goto(
      pathToFileURL(join(root, "widgets", composition.id, "index.html")).href,
    );
    await production.waitForFunction(
      () => window.TikTokCompositionDiagnostics?.().state === "ready",
    );
    await production.evaluate(() => {
      const user = {
        id: "9007199254740993",
        nickname: "Viewer123",
        handle: "Viewer123",
        avatarUrl: "",
      };
      for (const [type, data] of [
        ["tiktok.chat", { user, comment: "Hello from the local walkthrough" }],
        [
          "tiktok.gift",
          {
            user,
            giftId: "5655",
            giftName: "Rose",
            giftIconUrl: "",
            groupId: "guide",
            repeatCount: "23",
            diamondCount: "1",
            repeatEnd: true,
          },
        ],
      ])
        window.dispatchEvent(
          new CustomEvent("universal:event", {
            detail: {
              version: 1,
              id: "guide-" + type,
              source: "simulation.guide",
              timestamp: "2026-10-21T12:00:00.000Z",
              type,
              data,
            },
          }),
        );
    });
    assert.match(
      (await production.locator(".item").allTextContents()).join(" "),
      /Rose/,
    );
    report.renderer = await production.evaluate(() =>
      window.TikTokCompositionDiagnostics(),
    );
    // IDs are runtime-generated and irrelevant to the published guide.
    report.renderer.widgets = report.renderer.widgets.map(({ state }) => ({
      state,
    }));
  });
  await production.close();
  assert.deepEqual(errors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error.message).replace(
    /#[A-Za-z0-9-]{32,}/g,
    "#[redacted]",
  );
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await context?.close();
  if (studioVideo)
    await studioVideo.saveAs(join(output, "studio-walkthrough.webm"));
  if (rendererVideo)
    await rendererVideo.saveAs(join(output, "offline-renderer.webm"));
  await browser?.close();
  await stopServer();
  rmSync(root, { recursive: true, force: true });
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
