import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const runner = process.env.UNIVERSAL_RECEIVER_RUNNER;
const gateway = process.env.UNIVERSAL_TIKTOOLS_GATEWAY;
async function port() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function until(fn) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error("Timed out waiting for integration");
}
function run(command, args, env) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  let out = "",
    err = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (err += chunk));
  child.on("error", () => {});
  return {
    child,
    stdout: () => out,
    stderr: () => err,
    done: new Promise((resolve) => child.once("exit", (code) => resolve(code))),
  };
}
test(
  "separate CLI and optional TikTools gateway reach the actual native receiver exactly once",
  { skip: !runner },
  async () => {
    const tmp = await mkdtemp(join(tmpdir(), "universal-e2e-"));
    const token = randomBytes(32).toString("hex");
    const receiverPort = await port();
    const env = {
      OBS_EVENT_TOKEN: token,
      OBS_EVENT_PORT: String(receiverPort),
      OBS_EVENT_ADDRESS: `http://127.0.0.1:${receiverPort}`,
    };
    const native = run(resolve(runner), [], env);
    let tik, browser;
    try {
      await until(() => native.stdout().includes("READY"));
      const cli = run(
        process.execPath,
        ["web/universal/tools/publish.mjs"],
        env,
      );
      assert.equal(await cli.done, 0, cli.stderr());
      await until(
        () =>
          native
            .stdout()
            .split("\n")
            .filter((line) => line.startsWith("{")).length === 1,
      );
      const first = JSON.parse(
        native
          .stdout()
          .split("\n")
          .find((line) => line.startsWith("{")),
      );
      assert.equal(first.source, "external.e2e");
      browser = await chromium.launch();
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(
        pathToFileURL(
          resolve(
            "data/web/templates/universal.gift-alert/1.0.0/src/index.html",
          ),
        ).href,
      );
      await page.waitForFunction(() =>
        document.getElementById("root").style.getPropertyValue("--accent"),
      );
      await page.evaluate((event) => {
        window.dispatchEvent(
          new CustomEvent("universal:event", { detail: event }),
        );
        window.dispatchEvent(
          new CustomEvent("universal:event", { detail: event }),
        );
      }, first);
      await page.waitForTimeout(100);
      assert.equal(
        await page.locator(".alert").count(),
        1,
        JSON.stringify({ first, errors }),
      );
      if (gateway) {
        const gatewayPort = await port();
        const dir = join(tmp, "tiktools.event-gateway");
        await mkdir(dir);
        await writeFile(
          join(dir, "settings.json"),
          JSON.stringify({
            port: gatewayPort,
            token: randomBytes(32).toString("hex"),
            widgetToken: randomBytes(32).toString("hex"),
            obsBridge: {
              enabled: true,
              address: `127.0.0.1:${receiverPort}`,
              tokenEnv: "OBS_EVENT_TOKEN",
              instance: "tiktools.e2e",
            },
          }),
        );
        tik = run(resolve(gateway), [], {
          ...env,
          TIKTOOLS_PLUGIN_DATA_DIR: tmp,
          TIKTOOLS_PLUGIN_ID: "tiktools.event-gateway",
        });
        tik.child.stdout.resume();
        await until(async () => {
          try {
            return (await fetch(`http://127.0.0.1:${gatewayPort}/health`)).ok;
          } catch {
            return false;
          }
        });
        const event = {
          topic: "live.event",
          data: {
            event: {
              id: "bridge-test-1",
              type: "custom.alert",
              timestamp: 1792504800000,
              data: { title: "From TikTools", message: "One alert" },
            },
          },
        };
        for (let i = 0; i < 2; i++) {
          const body = Buffer.from(
            JSON.stringify({
              protocolVersion: 1,
              id: `event-${i}`,
              method: "call",
              payload: { type: "event", event },
            }),
          );
          const header = Buffer.alloc(4);
          header.writeUInt32LE(body.length);
          tik.child.stdin.write(Buffer.concat([header, body]));
        }
        await until(() => native.stdout().includes("bridge-test-1"));
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(
          native
            .stdout()
            .split("\n")
            .filter((line) => line.includes("bridge-test-1")).length,
          1,
        );
        tik.child.kill();
        await tik.done;
        const after = run(
          process.execPath,
          ["web/universal/tools/publish.mjs"],
          env,
        );
        assert.equal(await after.done, 0);
        await until(
          () =>
            native
              .stdout()
              .split("\n")
              .filter((line) => line.startsWith("{")).length === 3,
        );
        assert.equal(tik.stderr().includes(token), false);
      }
      assert.equal(native.stderr().includes(token), false);
    } finally {
      tik?.child.kill();
      native.child.kill();
      await browser?.close();
      await native.done;
      await rm(tmp, { recursive: true, force: true });
    }
  },
);
