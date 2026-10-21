import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";

test(
  "scene selector supports known scenes, keyboard acceptance and cancellation",
  {
    skip: !process.env.PLAYGROUND_BROWSER_EXECUTABLE,
  },
  async () => {
    const bundle = await build({
      entryPoints: ["web/studio/components/Dialog.ts"],
      bundle: true,
      format: "iife",
      globalName: "Dialogs",
      write: false,
    });
    const browser = await chromium.launch({
      executablePath: process.env.PLAYGROUND_BROWSER_EXECUTABLE,
      headless: true,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 480, height: 480 },
        locale: "en-US",
      });
      await page.setContent('<button id="open">Add to OBS</button>');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(() => {
        document.querySelector("button").onclick = async () => {
          window.selection = await Dialogs.ask("Select scene", "Main", [
            "Main",
            "Gaming & chat",
          ]);
        };
      });
      await page.getByRole("button", { name: "Add to OBS" }).click();
      const select = page.getByRole("combobox", { name: "Select scene" });
      assert.equal(await select.inputValue(), "Main");
      assert.equal(await page.locator("dialog input").count(), 0);
      await select.selectOption("Gaming & chat");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForFunction(() => window.selection === "Gaming & chat");
      assert.equal(
        await page.evaluate(() => window.selection),
        "Gaming & chat",
      );
      assert.equal(
        await page
          .locator("#open")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByRole("button", { name: "Add to OBS" }).click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => window.selection === null);
      assert.equal(await page.evaluate(() => window.selection), null);
      await page.getByRole("button", { name: "Add to OBS" }).click();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.selection === "Main");
      assert.equal(await page.evaluate(() => window.selection), "Main");
    } finally {
      await browser.close();
    }
  },
);
