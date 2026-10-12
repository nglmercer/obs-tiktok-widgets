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
        .find((f) => f.url().includes("/preview.html?session="));
      assert.equal(
        await frame.evaluate(() => document.compatMode),
        "CSS1Compat",
      );
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
      await page.locator(".json-inspector summary").click();
      await page.locator("#completed").uncheck();
      await page.locator("#replay").click();
      await page.waitForFunction(
        () => document.querySelector("#history").children.length === 7,
      );
      assert.equal(
        JSON.parse(await page.locator("#json").innerText()).data.repeat_end,
        false,
      );
      assert.match(await frame.locator("#root").innerText(), /Rose × 23 …/);
      await page.locator("#interval").fill("1000");
      await page.locator("#replay").click();
      await page.locator("#stop").click();
      const stopped = await page.locator("#history li").count();
      await page.waitForTimeout(1100);
      assert.equal(await page.locator("#history li").count(), stopped);
      const stale = new URL(frame.url()).searchParams.get("session");
      await page.locator("#reset").click();
      await page.locator("#reset").click();
      await page.locator("#reset").click();
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
      assert.equal(await page.locator("#history li").count(), 0);
      const resetFrame = page
        .frames()
        .find((f) => f.url().includes("/preview.html?session="));
      assert.equal(await resetFrame.locator("#root").innerText(), "");
      await resetFrame.evaluate((stale) => {
        parent.postMessage(
          {
            channel: "tiktok-playground",
            version: 1,
            session: stale,
            action: "ready",
          },
          "*",
        );
        window.postMessage(
          {
            channel: "tiktok-playground",
            version: 1,
            session: stale,
            action: "event",
            event: { version: 1, synthetic: true },
          },
          "*",
        );
      }, stale);
      await page.waitForTimeout(100);
      assert.equal(await resetFrame.locator("#root").innerText(), "");
      await page.locator("#streak").uncheck();
      await page.locator("#username").fill("<img src=x onerror=alert(1)>");
      await page.getByText("Renderer options", { exact: true }).click();
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

test(
  "native generated documents retain standards mode and custom local assets; audio resolution and failures",
  { skip: !executablePath },
  async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const { execFileSync } = await import("node:child_process");
    const { pathToFileURL } = await import("node:url");
    const binary = process.env.PLAYGROUND_NATIVE_TEST || "build/widget-test";
    assert.ok(
      fs.existsSync(binary),
      "Build native widget-test before running this integration suite",
    );
    const root = fs.mkdtempSync(`${os.tmpdir()}/playground-browser-`);
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      execFileSync(binary, {
        env: { ...process.env, PLAYGROUND_FIXTURE_DIR: root },
      });
      const wav = Buffer.alloc(44 + 1600);
      wav.write("RIFF");
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24);
      wav.writeUInt32LE(16000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(1600, 40);
      const customId = fs.readFileSync(`${root}/custom-id.txt`, "utf8");
      const author = `${root}/projects/${customId}/src`;
      fs.writeFileSync(`${author}/tone.wav`, wav);
      execFileSync(process.env.WIDGETCTL || "build/widgetctl", [
        "--config",
        root,
        "--assets",
        new URL("../../data/web", import.meta.url).pathname,
        "widgets",
        "publish",
        customId,
        "--json",
      ]);
      const page = await browser.newPage();
      await page.goto(
        pathToFileURL(fs.readFileSync(`${root}/preview-path.txt`, "utf8")).href,
      );
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
      const frame = page.frames()[1];
      assert.equal(
        await frame.evaluate(() => document.compatMode),
        "CSS1Compat",
      );
      assert.equal(await frame.evaluate(() => document.doctype.name), "html");
      assert.equal(await frame.evaluate(() => window.customAssetLoaded), true);
      assert.equal(
        await frame
          .locator("#asset")
          .evaluate((el) => getComputedStyle(el).color),
        "rgb(12, 34, 56)",
      );
      assert.equal(
        await frame.locator("img").evaluate((el) => el.naturalWidth),
        10,
      );
      const audio = await frame.evaluate(async () => {
        const probe = (src) =>
          new Promise((resolve) => {
            const audio = new Audio(src);
            audio.onloadedmetadata = () => resolve("loaded");
            audio.onerror = () => resolve("missing");
          });
        return [await probe("tone.wav"), await probe("missing.wav")];
      });
      assert.deepEqual(audio, ["loaded", "missing"]);
      assert.equal(
        fs
          .readFileSync(`${author}/page.html`, "utf8")
          .includes("tiktok-bootstrap"),
        false,
      );
      const oldSession = new URL(frame.url()).searchParams.get("session");
      fs.writeFileSync(
        `${author}/nested/code.js`,
        "window.customAssetLoaded=true;document.getElementById('asset').textContent='Published edit Ω';",
      );
      fs.writeFileSync(
        `${author}/nested/style.css`,
        "#asset {color:rgb(99,88,77)}",
      );
      execFileSync(process.env.WIDGETCTL || "build/widgetctl", [
        "--config",
        root,
        "--assets",
        new URL("../../data/web", import.meta.url).pathname,
        "widgets",
        "publish",
        customId,
        "--json",
      ]);
      await page.waitForFunction(
        (old) =>
          new URL(document.getElementById("preview").src).searchParams.get(
            "session",
          ) !== old,
        oldSession,
      );
      await page.waitForFunction(
        () => !document.getElementById("replay").disabled,
      );
      const updated = page.frames()[1];
      assert.equal(
        await updated.locator("#asset").innerText(),
        "Published edit Ω",
      );
      assert.equal(
        await updated
          .locator("#asset")
          .evaluate((el) => getComputedStyle(el).color),
        "rgb(99, 88, 77)",
      );
      const production = await browser.newPage();
      await production.goto(
        pathToFileURL(`${root}/widgets/${customId}/index.html`).href,
      );
      assert.equal(
        await production.locator("#asset").innerText(),
        "Published edit Ω",
      );
      await production.close();
      await page.goto(
        pathToFileURL(fs.readFileSync(`${root}/builtin-path.txt`, "utf8")).href,
      );
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
      const built = page.frames()[1];
      assert.equal(
        await built.evaluate(() => document.compatMode),
        "CSS1Compat",
      );
      await built.evaluate(() => {
        window.audioUrls = [];
        window.Audio = class {
          constructor(url) {
            window.audioUrls.push(url);
          }
          play() {
            return Promise.reject(new Error("Autoplay denied"));
          }
        };
        window.TikTokWidgetConfig.soundUrl = "nested/audio.wav";
        // Update renderer through the validated frame session, preserving configured soundUrl.
        window.dispatchEvent(
          new CustomEvent("tiktok:preview-settings", {
            detail: { animation: false, sound: true },
          }),
        );
      });
      await page.getByText("Renderer options", { exact: true }).click();
      await page.locator("#sound").check();
      // Configure before renderer startup for each audio case.
      for (const soundUrl of [
        "nested/audio.wav",
        "file:///tmp/explicit-audio.wav",
        "https://example.org/audio.wav",
        "javascript:alert(1)",
      ]) {
        await built.evaluate(
          ({ soundUrl, scriptUrl }) => {
            window.TikTokWidgetConfig = {
              template: "gifts",
              sound: true,
              soundUrl,
            };
            const script = document.createElement("script");
            script.src = scriptUrl;
            document.body.append(script);
          },
          {
            soundUrl,
            scriptUrl: new URL(
              "../../data/web/widgets/widget.js",
              import.meta.url,
            ).href,
          },
        );
        await built.waitForTimeout(50);
        await page.locator("#replay").click();
        await built.waitForTimeout(50);
      }
      const urls = await built.evaluate(() => window.audioUrls);
      assert.ok(
        urls.some(
          (u) => u.endsWith("/nested/audio.wav") && u.includes("/releases/"),
        ),
      );
      assert.ok(urls.includes("file:///tmp/explicit-audio.wav"));
      assert.ok(urls.includes("https://example.org/audio.wav"));
      assert.ok(urls.every((u) => !u.startsWith("javascript:")));
      assert.match(
        await page.locator("#status").innerText(),
        /Audio playback failed/,
      );
      assert.equal(
        await built.locator('head script[src$="frame.js"]').count(),
        1,
      );
      assert.equal(await built.locator('script[src$="config.js"]').count(), 0);
    } finally {
      await browser.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "reset while initialization is pending rejects old loaded and ready packets",
  { skip: !executablePath },
  async () => {
    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        if (parent === window) return;
        const register = window.addEventListener.bind(window);
        window.addEventListener = (name, fn, options) =>
          register(
            name,
            name === "load"
              ? () => setTimeout(() => fn.call(window, new Event("load")), 350)
              : fn,
            options,
          );
      });
      await page.goto(
        new URL("../../data/web/playground/index.html", import.meta.url).href,
      );
      const old = new URL(page.frames()[1].url()).searchParams.get("session");
      await page.locator("#reset").click();
      await page.locator("#reset").click();
      await page.waitForTimeout(40);
      const active = page.frames()[1];
      await active.evaluate((old) => {
        for (const action of ["loaded", "ready"])
          parent.postMessage(
            { channel: "tiktok-playground", version: 1, session: old, action },
            "*",
          );
      }, old);
      await page.waitForTimeout(40);
      assert.equal(await page.locator("#replay").isDisabled(), true);
      assert.equal(await page.locator("#history li").count(), 0);
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
      assert.equal(await page.locator("#history li").count(), 0);
      await active.evaluate(() => location.reload());
      await page.waitForFunction(
        (old) =>
          new URL(document.querySelector("#preview").src).searchParams.get(
            "session",
          ) !== old,
        new URL(active.url()).searchParams.get("session"),
      );
      await page.waitForFunction(
        () => !document.querySelector("#replay").disabled,
      );
    } finally {
      await browser.close();
    }
  },
);
