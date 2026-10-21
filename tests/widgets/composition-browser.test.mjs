import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const executablePath = process.env.PLAYGROUND_BROWSER_EXECUTABLE;
test(
  "published local-file compositor: one event path, independent widgets, streaks, cleanup and mount isolation",
  { skip: !executablePath },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "composition-browser-"));
    const browser = await chromium.launch({ executablePath, headless: true });
    const run = (args) => {
      const r = spawnSync(
        process.env.WIDGETCTL || "build/widgetctl",
        ["--config", root, "--assets", resolve("data/web"), ...args, "--json"],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return JSON.parse(r.stdout).data;
    };
    try {
      let p = run(["compositions", "create"]);
      const widgets = [
        "builtin.chat",
        "builtin.chat",
        "builtin.gift-alert",
        "builtin.likes",
        "builtin.viewers",
        "builtin.custom",
      ].map((id, i) => ({
        id: "widget-" + i,
        template: { id, version: "2.0.0" },
        enabled: true,
        visible: true,
        locked: false,
        transform: {
          x: i * 200,
          y: 0,
          width: 200,
          height: 400,
          rotation: 0,
          opacity: 1,
        },
        zIndex: i,
        settings:
          id === "builtin.custom"
            ? {
                html: '<p id="message">Custom</p><script>window.addEventListener("universal:event",e=>document.querySelector("#message").textContent=e.detail.type)</script>',
              }
            : {},
      }));
      p = run([
        "compositions",
        "update",
        p.id,
        "--if-revision",
        p.revision,
        "--set",
        "widgets=" + JSON.stringify(widgets),
      ]);
      run(["compositions", "publish", p.id, "--if-revision", p.revision]);
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.context().setOffline(true);
      await page.goto(
        pathToFileURL(join(root, "widgets", p.id, "index.html")).href,
      );
      await page.waitForFunction(
        () => window.TikTokCompositionDiagnostics?.().state === "ready",
      );
      const emit = (type, data, id) =>
        page.evaluate(
          ({ type, data, id }) => {
            const event = {
              version: 1,
              id,
              source: "tiktok.native",
              type,
              timestamp: "2026-10-21T12:00:00.000Z",
              data,
              metadata: { room: "room" },
            };
            window.dispatchEvent(
              new CustomEvent("universal:event", { detail: event }),
            );
            window.dispatchEvent(
              new CustomEvent("universal:event", { detail: event }),
            );
            window.dispatchEvent(
              new CustomEvent("tiktok:event", {
                detail: {
                  version: 1,
                  type: "chat",
                  data: { comment: "duplicate legacy" },
                },
              }),
            );
          },
          { type, data, id },
        );
      await emit(
        "tiktok.chat",
        {
          comment: "Hello",
          user: {
            id: "9007199254740993",
            nickname: "Viewer123",
            handle: "Viewer123",
            avatarUrl: "",
          },
        },
        "chat1",
      );
      assert.equal(
        await page.locator('[data-widget="widget-0"] .item').count(),
        1,
      );
      assert.equal(
        await page.locator('[data-widget="widget-1"] .item').count(),
        1,
      );
      for (const count of ["1", "5", "23"])
        await emit(
          "tiktok.gift",
          {
            giftId: "5655",
            giftName: "Rose",
            giftIconUrl: "",
            diamondCount: "1",
            repeatCount: count,
            repeatEnd: count === "23",
            groupId: "streak",
            user: {
              id: "9007199254740993",
              nickname: "Viewer123",
              handle: "Viewer123",
              avatarUrl: "",
            },
          },
          "gift" + count,
        );
      assert.match(
        await page.locator('[data-widget="widget-2"] #root').innerText(),
        /Rose × 23 ✓/,
      );
      assert.equal(
        await page.locator('[data-widget="widget-2"] .item').count(),
        1,
      );
      await emit(
        "tiktok.like",
        {
          count: "1",
          total: "9007199254740993",
          user: {
            id: "1",
            nickname: "Viewer123",
            handle: "Viewer123",
            avatarUrl: "",
          },
        },
        "like1",
      );
      await emit("tiktok.room_stats", { total: "123" }, "viewers1");
      await page.waitForFunction(() =>
        document
          .querySelector('[data-widget="widget-3"]')
          .shadowRoot.textContent.includes("9007199254740993"),
      );
      await page.waitForFunction(() =>
        document
          .querySelector('[data-widget="widget-4"]')
          .shadowRoot.querySelector("#root")
          .textContent.includes("123"),
      );
      assert.match(
        await page.locator('[data-widget="widget-4"] #root').innerText(),
        /123/,
      );
      const custom = await (
        await page.locator('[data-widget="widget-5"] iframe').elementHandle()
      ).contentFrame();
      assert.equal(
        await custom.locator("#message").textContent(),
        "tiktok.room_stats",
        JSON.stringify({
          errors,
          diagnostics: await page.evaluate(() =>
            window.TikTokCompositionDiagnostics(),
          ),
          html: await custom.content(),
        }),
      );
      assert.equal(
        await custom.evaluate(() => {
          try {
            return !!parent.document;
          } catch {
            return false;
          }
        }),
        false,
      );
      const result = await page.evaluate(async () => {
        const { CompositionRuntime, builtinRegistry } = TikTokCompositor;
        const root = document.createElement("div");
        document.body.append(root);
        const registry = builtinRegistry();
        registry.register({
          id: "test.failure",
          version: "1.0.0",
          events: [],
          createRuntime: () => ({
            mount() {
              throw Error("expected");
            },
            destroy() {},
          }),
        });
        let aborted = false;
        registry.register({
          id: "test.hanging",
          version: "1.0.0",
          events: [],
          createRuntime: ({ signal }) => ({
            mount() {
              signal.addEventListener("abort", () => (aborted = true));
              return new Promise(() => {});
            },
            destroy() {},
          }),
        });
        const runtime = new CompositionRuntime(root, registry, {
          mountTimeout: 20,
        });
        const widget = {
          id: "good",
          template: { id: "builtin.chat", version: "2.0.0" },
          enabled: true,
          locked: false,
          visible: true,
          transform: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
          },
          zIndex: 0,
          settings: {},
        };
        const composition = {
          contract: "obs-widget-composition",
          schemaVersion: 1,
          viewport: { width: 300, height: 300 },
          background: "transparent",
          widgets: [
            widget,
            {
              ...widget,
              id: "bad",
              template: { id: "test.failure", version: "1.0.0" },
            },
            {
              ...widget,
              id: "hanging",
              template: { id: "test.hanging", version: "1.0.0" },
            },
          ],
        };
        await runtime.load(composition);
        const diagnostics = runtime.diagnostics();
        for (let i = 0; i < 50; i++)
          await runtime.load({ ...composition, widgets: [widget] });
        const started = performance.now();
        for (let i = 0; i < 5000; i++)
          window.dispatchEvent(
            new CustomEvent("universal:event", {
              detail: {
                version: 1,
                id: "burst-" + i,
                source: "tiktok.native",
                type: "tiktok.chat",
                timestamp: "2026-10-21T12:00:00.000Z",
                data: {
                  comment: "burst " + i,
                  user: {
                    id: "9007199254740993",
                    nickname: "Viewer123",
                    handle: "Viewer123",
                    avatarUrl: "",
                  },
                },
              },
            }),
          );
        const burst = {
          milliseconds: performance.now() - started,
          accepted: runtime.diagnostics().events.accepted,
          overflow: runtime.diagnostics().queueOverflow,
          rows: root
            .querySelector('[data-widget="good"]')
            .shadowRoot.querySelectorAll(".item").length,
        };
        await runtime.load({
          ...composition,
          widgets: [
            widget,
            {
              ...widget,
              id: "bad-custom",
              template: { id: "builtin.custom", version: "2.0.0" },
              settings: {
                html: '<script>throw new Error("expected custom failure")</script>',
              },
            },
          ],
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        const customFailure = runtime
          .diagnostics()
          .widgets.find((widget) => widget.id === "bad-custom");
        const goodState = runtime
          .diagnostics()
          .widgets.find((widget) => widget.id === "good").state;
        runtime.destroy();
        const accepted = runtime.diagnostics().events.accepted;
        window.dispatchEvent(
          new CustomEvent("universal:event", {
            detail: {
              version: 1,
              id: "after",
              source: "tiktok.native",
              type: "tiktok.chat",
              timestamp: "2026-10-21T12:00:00.000Z",
              data: { comment: "after" },
            },
          }),
        );
        return {
          diagnostics,
          burst,
          customFailure,
          goodState,
          aborted,
          remaining: root.children.length,
          accepted,
          after: runtime.diagnostics().events.accepted,
        };
      });
      assert.equal(result.diagnostics.state, "degraded");
      assert.equal(result.diagnostics.mountErrors, 2);
      assert.equal(result.burst.accepted, 5000);
      assert.equal(result.burst.overflow, 0);
      assert.equal(result.burst.rows, 30);
      console.log("Composition burst:", JSON.stringify(result.burst));
      assert.equal(result.customFailure.state, "failed");
      assert.equal(result.customFailure.error, "CUSTOM_SCRIPT_FAILED");
      assert.equal(result.goodState, "ready");
      assert.equal(result.aborted, true);
      assert.equal(result.remaining, 0);
      assert.equal(result.accepted, result.after);
      assert.deepEqual(
        errors.filter((error) => error !== "expected custom failure"),
        [],
      );
    } finally {
      await browser.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
