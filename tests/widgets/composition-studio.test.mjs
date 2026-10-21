import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const executablePath = process.env.PLAYGROUND_BROWSER_EXECUTABLE;
const cli = process.env.WIDGETCTL,
  helper = process.env.WIDGETSTUDIO;
test(
  "Studio composition drafts, simulation, geometry, save and responsive canvas",
  { skip: !executablePath || !cli || !helper },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "composition-studio-"));
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
      "Studio canvas",
    ]);
    const server = spawn(
      helper,
      ["--confirm", "--config", root, "--assets", resolve("data/web")],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const url = await new Promise((resolve, reject) => {
        let output = "";
        const timer = setTimeout(
          () => reject(Error("Studio startup timed out")),
          10000,
        );
        server.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("\n")) {
            clearTimeout(timer);
            resolve(JSON.parse(output.split("\n")[0]).data.url);
          }
        });
        server.once("exit", () => {
          clearTimeout(timer);
          reject(Error("Studio exited"));
        });
      });
      const address = new URL(url);
      address.searchParams.set("widget", composition.id);
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        locale: "en-US",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(address.href);
      await page
        .getByRole("button", { name: "Add widget", exact: true })
        .click({ timeout: 5000 })
        .catch(async (error) => {
          throw new Error(
            String(error) +
              "\n" +
              (await page.locator("body").innerText()) +
              "\n" +
              JSON.stringify(errors),
          );
        });
      assert.equal(
        command(["compositions", "get", composition.id]).settings.composition
          .widgets.length,
        0,
      );
      await page
        .getByRole("button", { name: "Simulate composition", exact: true })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector(".composition-scroll [data-widget]")
          ?.shadowRoot.querySelector(".item"),
      );
      await page.getByLabel("width", { exact: true }).fill("500");
      await page
        .getByRole("button", { name: "Save design", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(
            ".composition-editor .canvas-tools button:last-child",
          )?.disabled,
      );
      const saved = command(["compositions", "get", composition.id]);
      assert.equal(saved.settings.composition.widgets.length, 1);
      assert.equal(saved.settings.composition.widgets[0].transform.width, 500);
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
          `overflow at ${width}`,
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        if (server.exitCode !== null) resolve();
        else server.once("exit", resolve);
      });
      rmSync(root, { recursive: true, force: true });
    }
  },
);
