import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const executablePath = process.env.PLAYGROUND_BROWSER_EXECUTABLE;
const cli = process.env.WIDGETCTL,
  helper = process.env.WIDGETSTUDIO;
test(
  "480×480 composition editing: canvas, geometry, drag and revisioned save",
  { skip: !executablePath || !cli || !helper },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "composition-480-"));
    const output = resolve(
      process.env.COMPOSITION_COMPACT_OUTPUT ||
        "docs/validation/compositions/compact480",
    );
    mkdirSync(output, { recursive: true });
    const command = (args) => {
      const result = spawnSync(
        cli,
        ["--config", root, "--assets", resolve("data/web"), ...args, "--json"],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(result.stdout).data;
    };
    const composition = command([
      "compositions",
      "create",
      "--name",
      "My overlay",
    ]);
    const server = spawn(
      helper,
      ["--confirm", "--config", root, "--assets", resolve("data/web")],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    server.stderr.on("data", () => {});
    const browser = await chromium.launch({ executablePath, headless: true });
    let page;
    try {
      const address = await new Promise((resolve, reject) => {
        let buffer = "";
        const timer = setTimeout(
          () => reject(Error("Studio startup timeout")),
          10000,
        );
        server.stdout.on("data", (chunk) => {
          buffer += chunk;
          if (buffer.includes("\n")) {
            clearTimeout(timer);
            resolve(JSON.parse(buffer.split("\n")[0]).data.url);
          }
        });
        server.once("exit", () => {
          clearTimeout(timer);
          reject(Error("Studio exited before startup"));
        });
      });
      const url = new URL(address);
      url.searchParams.set("widget", composition.id);
      page = await browser.newPage({
        viewport: { width: 480, height: 480 },
        locale: "en-US",
        recordVideo: {
          dir: join(root, "recordings"),
          size: { width: 480, height: 480 },
        },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url.href);
      const canvas = page.getByLabel("Composition canvas", { exact: true });
      await canvas.waitFor();
      const initialCanvas = await canvas.boundingBox();
      assert.ok(
        initialCanvas.height >= 200,
        `Canvas only ${initialCanvas.height}px high`,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Undo design", exact: true })
          .count(),
        1,
      );
      assert.equal(
        await page.getByRole("button", { name: "Undo", exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByLabel("Preview viewport", { exact: true }).count(),
        0,
      );
      assert.equal(await page.locator(".panel-switch").count(), 0);
      const panels = page.getByRole("group", {
        name: "Workspace panels",
        exact: true,
      });
      await panels
        .getByRole("button", { name: "Inspector", exact: true })
        .click();
      await page.getByLabel("Canvas width", { exact: true }).fill("480");
      await page.getByLabel("Canvas height", { exact: true }).fill("480");
      await page
        .getByRole("button", { name: "Add widget", exact: true })
        .click();
      await page.getByLabel("Name", { exact: true }).fill("Chat");
      for (const [key, value] of Object.entries({
        x: 20,
        y: 20,
        width: 220,
        height: 160,
      }))
        await page.getByLabel(key, { exact: true }).fill(String(value));
      assert.equal(
        command(["compositions", "get", composition.id]).settings.composition
          .widgets.length,
        0,
      );
      await panels.getByRole("button", { name: "Canvas", exact: true }).click();
      await page
        .getByRole("button", { name: "Simulate composition", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector(".composition-scroll [data-widget]")
          ?.shadowRoot.querySelector(".item"),
      );
      const hit = page.locator('.composition-hit[data-selected="true"]');
      const box = await hit.boundingBox();
      await page.mouse.move(box.x + 15, box.y + 15);
      await page.mouse.down();
      await page.mouse.move(box.x + 45, box.y + 30, { steps: 5 });
      await page.mouse.up();
      await page.mouse.move(1, 1);
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: join(output, "canvas-480.png"),
        animations: "disabled",
      });
      await panels
        .getByRole("button", { name: "Inspector", exact: true })
        .click();
      const movedX = Number(
        await page.getByLabel("x", { exact: true }).inputValue(),
      );
      assert.ok(movedX > 20, "Dragging must update authoritative geometry");
      const widthBox = await page
        .getByLabel("width", { exact: true })
        .boundingBox();
      assert.ok(
        widthBox.y + widthBox.height <= 480,
        "Size editing must be visible without scrolling the page",
      );
      const save = page.getByRole("button", {
        name: "Save design",
        exact: true,
      });
      await save.click();
      await page.waitForFunction(
        () =>
          document.querySelector('button[aria-label="Save design"]')?.disabled,
      );
      const saved = command(["compositions", "get", composition.id]);
      assert.deepEqual(saved.settings.composition.viewport, {
        width: 480,
        height: 480,
      });
      assert.equal(saved.settings.composition.widgets[0].transform.width, 220);
      assert.equal(saved.settings.composition.widgets[0].transform.x, movedX);
      await page.mouse.move(1, 1);
      await page.keyboard.press("Escape");
      await page.screenshot({
        path: join(output, "inspector-480.png"),
        animations: "disabled",
      });
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth > innerWidth ||
          document.querySelector(".studio main").scrollHeight >
            document.querySelector(".studio main").clientHeight,
      );
      assert.equal(overflow, false, "Only the contextual panel should scroll");
      assert.deepEqual(errors, []);
      writeFileSync(
        join(output, "results.json"),
        JSON.stringify(
          {
            passed: true,
            window: { width: 480, height: 480 },
            canvasArea: initialCanvas,
            composition: saved.settings.composition.viewport,
            widget: saved.settings.composition.widgets[0].transform,
            duplicateUndoControls: false,
            pageOverflow: false,
            pageErrors: errors,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      try {
        await page?.context().close();
        if (page) await page.video().saveAs(join(output, "editing-480.webm"));
      } finally {
        await browser.close();
        if (server.exitCode === null && server.signalCode === null) {
          const ended = new Promise((resolve) => server.once("exit", resolve));
          server.kill("SIGTERM");
          await ended;
        }
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
);
