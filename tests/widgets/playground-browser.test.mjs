import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const executablePath = process.env.PLAYGROUND_BROWSER_EXECUTABLE;
test(
  "file-based real browser preview, streak, replay, stop, reset, safe text and isolation",
  { skip: !executablePath },
  async () => {
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const context = await browser.newContext({
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        new URL("../../data/web/playground/index.html", import.meta.url).href,
      );
      await page.waitForFunction(
        () => document.querySelector("#history").children.length === 1,
      );
      const frame = page
        .frames()
        .find((f) => f.url().endsWith("/preview.html"));
      assert.equal(
        await frame.locator("#root").innerText(),
        "Viewer123\nRose × 23 ✓",
      );
      await page.evaluate(() => {
        window.leaks = 0;
        window.addEventListener("tiktok:event", () => window.leaks++);
      });
      await frame.evaluate(() => {
        window.order = [];
        window.addEventListener("tiktok:event", () =>
          window.order.push("event"),
        );
        window.addEventListener("tiktok:gift", () => window.order.push("gift"));
      });
      await page.locator("#streak").check();
      await page.locator("#interval").fill("30");
      await page.locator("#replay").click();
      await page.waitForFunction(
        () => document.querySelector("#history").children.length === 4,
      );
      assert.equal(await frame.locator("#root .item").count(), 2);
      assert.match(await frame.locator("#root").innerText(), /Rose × 23 ✓/);
      assert.doesNotMatch(await frame.locator("#root").innerText(), /29/);
      assert.deepEqual(await frame.evaluate(() => window.order), [
        "event",
        "gift",
        "event",
        "gift",
        "event",
        "gift",
      ]);
      assert.equal(await page.evaluate(() => window.leaks), 0);
      await page.locator("#interval").fill("1000");
      await page.locator("#replay").click();
      await page.locator("#stop").click();
      const stopped = await page.locator("#history li").count();
      await page.waitForTimeout(1100);
      assert.equal(await page.locator("#history li").count(), stopped);
      await page.locator("#reset").click();
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
      assert.equal(await page.locator("#history li").count(), 0);
      const resetFrame = page
        .frames()
        .find((f) => f.url().endsWith("/preview.html"));
      assert.equal(await resetFrame.locator("#root").innerText(), "");
      await page.locator("#streak").uncheck();
      await page.locator("#username").fill("<img src=x onerror=alert(1)>");
      await page.locator("#animation").uncheck();
      await page.locator("#replay").click();
      await page.waitForFunction(
        () => document.querySelector("#history").children.length === 1,
      );
      await resetFrame.locator("#root .item").waitFor();
      assert.equal(await resetFrame.locator("#root img").count(), 0);
      assert.match(
        await resetFrame.locator("#root").innerText(),
        /<img src=x onerror=alert\(1\)>/,
      );
      assert.equal(await resetFrame.locator(".animate").count(), 0);
      const json = JSON.parse(await page.locator("#json").innerText());
      assert.equal(json.data.repeat_count, "23");
      assert.equal(json.synthetic, true);
      await page.locator("#copy").click();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        JSON.stringify(json, null, 2),
      );
      await page.setViewportSize({ width: 420, height: 800 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
