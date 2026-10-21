import { test } from "node:test";
import assert from "node:assert/strict";
import { createWidgetHealthClient } from "../../web/runtime/health-client.js";
function fixture() {
  const target = new EventTarget();
  let now = 0;
  const client = createWidgetHealthClient({ target, now: () => now, limit: 8 });
  return { client, target, advance: (ms) => (now += ms) };
}
test("readiness requires explicit mount; diagnostics bounded and redacted", () => {
  const { client, target } = fixture();
  assert.equal(client.snapshot()[0].kind, "loading");
  target.dispatchEvent(new Event("load"));
  assert.ok(!client.snapshot().some((x) => x.kind === "ready"));
  client.ready();
  assert.equal(client.snapshot().at(-1).data.widgetMounted, true);
  for (let n = 0; n < 100; n++)
    client.report("runtime.error", {
      code: "JS_EXCEPTION",
      message: "secret",
      url: "file:///private",
    });
  assert.equal(client.snapshot().length, 8);
  assert.ok(!JSON.stringify(client.snapshot()).includes("secret"));
  client.dispose();
  const before = client.snapshot();
  target.dispatchEvent(new Event("error"));
  assert.deepEqual(client.snapshot(), before);
});
test("stable identity dedup keeps cumulative gift updates distinct", () => {
  const { client } = fixture();
  const gift = (count) => ({
    messageId: "gift-1",
    type: "gift",
    data: { repeat_count: count },
  });
  assert.ok(client.begin(gift("1"), { deduplicate: true }));
  assert.ok(client.begin(gift("23"), { deduplicate: true }));
  assert.equal(client.begin(gift("23"), { deduplicate: true }), null);
  assert.equal(client.snapshot().at(-1).data.code, "DUPLICATE");
  assert.ok(
    client.begin(
      { ...gift("23"), data: { repeat_count: "23", repeat_end: true } },
      { deduplicate: true },
    ),
  );
  client.dispose();
});
test("separate pages and independent audio/handler outcomes", () => {
  const a = fixture(),
    b = fixture();
  assert.notEqual(a.client.instanceId, b.client.instanceId);
  a.target.dispatchEvent(new Event("unhandledrejection"));
  assert.equal(a.client.snapshot().at(-1).data.code, "UNHANDLED_REJECTION");
  assert.equal(b.client.snapshot().at(-1).kind, "loading");
  const ticket = a.client.begin({ id: "event-1", type: "alert" });
  a.client.processed(ticket);
  a.client.report("audio.failed", { code: "AUDIO_BLOCKED" });
  assert.ok(a.client.snapshot().some((x) => x.kind === "event.processed"));
  assert.ok(!a.client.snapshot().some((x) => x.kind === "event.rendered"));
  a.client.dispose();
  b.client.dispose();
});

test("font timeout degrades diagnostics without holding event processing", async () => {
  const target = new EventTarget();
  const client = createWidgetHealthClient({
    target,
    document: { fonts: { status: "loading", ready: new Promise(() => {}) } },
  });
  client.ready();
  const ticket = client.begin({ id: "font-event", type: "gift" });
  client.processed(ticket);
  assert.ok(client.snapshot().some((r) => r.kind === "event.processed"));
  await new Promise((resolve) => setTimeout(resolve, 3050));
  assert.ok(client.snapshot().some((r) => r.data.code === "FONT_TIMEOUT"));
  client.dispose();
});

test("failed optional telemetry is asynchronous, bounded, and omits raw data", async () => {
  const target = new EventTarget();
  const sent = [];
  target.TikTokWidgetHealthSession = {
    endpoint: "http://127.0.0.1:12345/widget-health/v1/report",
    token: "private-capability",
    sessionId: "session",
  };
  target.TikTokWidgetHealthIdentity = { widgetId: "widget", buildId: "build" };
  target.fetch = (url, options) => {
    sent.push(JSON.parse(options.body));
    return Promise.reject(new Error("offline"));
  };
  const client = createWidgetHealthClient({ target });
  const ticket = client.begin({
    id: "test-event",
    type: "follow",
    data: { comment: "private-chat" },
  });
  client.processed(ticket);
  assert.equal(sent.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(client.transportStatus(), "unavailable");
  assert.ok(sent.length > 0);
  assert.ok(!JSON.stringify(sent).includes("private-chat"));
  assert.ok(!JSON.stringify(client.snapshot()).includes("private-capability"));
  client.dispose();
});

test("dedup window expires even without intervening events", () => {
  const { client, advance } = fixture();
  const event = { id: "old-event", type: "follow" };
  assert.ok(client.begin(event, { deduplicate: true }));
  advance(30001);
  assert.ok(client.begin(event, { deduplicate: true }));
  client.dispose();
});
