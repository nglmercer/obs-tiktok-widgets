import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  fixture,
  scenario,
  integer,
  ScenarioEngine,
  dispatchLocal,
} from "../../data/web/playground/engine.mjs";
globalThis.CustomEvent ??= class extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options.detail;
  }
};
test("v1 default Viewer123 completed Rose ×23 and full integer precision", () => {
  const e = fixture();
  assert.equal(e.version, 1);
  assert.equal(e.type, "gift");
  assert.equal(e.method, "WebcastGiftMessage");
  assert.equal(e.synthetic, true);
  assert.equal(e.data.user.nickname, "Viewer123");
  assert.equal(e.data.user.id, "9007199254740993");
  assert.equal(e.data.gift_name, "Rose");
  assert.equal(e.data.gift_id, "5655");
  assert.equal(e.data.repeat_count, "23");
  assert.equal(e.data.repeat_end, true);
  assert.equal(integer("18446744073709551615"), "18446744073709551615");
  assert.throws(() => integer("18446744073709551616"));
  assert.throws(() => integer("<script>"));
  assert.throws(() => integer("1.5"));
});
test("unique messages, independent groups, cumulative streak", () => {
  const a = scenario({}, true),
    b = scenario({}, true);
  assert.deepEqual(
    a.map((e) => e.data.repeat_count),
    ["1", "5", "23"],
  );
  assert.deepEqual(
    a.map((e) => e.data.repeat_end),
    [false, false, true],
  );
  assert.equal(new Set(a.map((e) => e.data.group_id)).size, 1);
  assert.notEqual(a[0].data.group_id, b[0].data.group_id);
  assert.equal(new Set([...a, ...b].map((e) => e.messageId)).size, 6);
});
test("ordered generic and typed dispatch stays local", () => {
  const local = new EventTarget(),
    production = new EventTarget(),
    order = [];
  let leaked = false;
  production.addEventListener("tiktok:event", () => (leaked = true));
  local.addEventListener("tiktok:event", (e) =>
    order.push(["event", e.detail]),
  );
  local.addEventListener("tiktok:gift", (e) => order.push(["gift", e.detail]));
  const e = fixture();
  dispatchLocal(local, e);
  assert.deepEqual(order, [
    ["event", e],
    ["gift", e],
  ]);
  assert.equal(leaked, false);
});
test("replay regenerates IDs; stop, reset, reentrant cancellation", async () => {
  const received = [],
    engine = new ScenarioEngine((e) => received.push(e));
  engine.play(() => scenario({}, true), 15, 2);
  engine.stop();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(received.length, 1);
  engine.play(() => scenario(), 0, 2);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(received.length, 3);
  assert.equal(new Set(received.map((e) => e.messageId)).size, 3);
  engine.play(() => scenario({}, true), 20);
  engine.reset(() => (received.length = 0));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(received.length, 0);
  const reentrant = new ScenarioEngine(() => reentrant.stop());
  reentrant.play(() => scenario({}, true), 0);
});
test("frame validates sender, synthetic contract and dispatch order", () => {
  const listeners = {},
    events = [],
    sent = [],
    parent = { postMessage: (e) => sent.push(e) };
  const window = {
    TikTokWidgetConfig: {},
    location: {href:"file:///preview.html?session=test"},
    addEventListener: (t, fn) => (listeners[t] = fn),
    dispatchEvent: (e) => events.push(e.type),
  };
  vm.runInNewContext(fs.readFileSync("data/web/playground/frame.js", "utf8"), {
    window,
    parent,
    CustomEvent, URL, document: {referrer:""}, dispatchEvent: () => {},
  });
  listeners.load();
  assert.equal(sent[0].action, "loaded");
  const packet = {
    channel: "tiktok-playground",
    action: "event", version: 1, session: "test",
    event: fixture(),
  };
  listeners.message({ source: {}, data: packet });
  assert.equal(events.length, 0);
  listeners.message({
    source: parent,
    data: { ...packet, event: { ...packet.event, synthetic: false } },
  });
  assert.equal(events.length, 0);
  listeners.message({ source: parent, data: packet });
  assert.equal(events.length, 0);
  listeners.message({source:parent, data:{channel:"tiktok-playground",session:"test",version:1,action:"settings",animation:true,sound:false}});
  for (const invalid of [{...packet, session:"old"}, {...packet,version:2}, {...packet,event:{...packet.event,data:{}}}, {...packet,action:"unknown"}, {...packet, padding:"x".repeat(65537)}]) listeners.message({source:parent,data:invalid});
  assert.equal(events.length, 0);
  listeners.message({ source: parent, data: packet });
  assert.deepEqual(events, ["tiktok:event", "tiktok:gift"]);
});
test("packaged assets match sources and iframe is sandboxed with no transport", () => {
  for (const name of ["index.html", "playground.css", "preview.html"])
    assert.equal(
      fs.readFileSync(`data/web/playground/${name}`, "utf8"),
      fs.readFileSync(`web/playground/${name}`, "utf8"),
    );
  assert.match(
    fs.readFileSync("web/playground/index.html", "utf8"),
    /sandbox="allow-scripts allow-same-origin"/,
  );
  for (const path of [
    "web/playground/app.ts",
    "web/playground/engine.ts",
    "web/playground/frame.ts",
  ])
    assert.doesNotMatch(
      fs.readFileSync(path, "utf8"),
      /BrowserEventBridge|EventDispatcher|WebSocket|fetch\(|innerHTML/,
    );
  assert.equal(
    fs.readFileSync("data/web/widgets/widget.js", "utf8"),
    fs.readFileSync("web/widgets/widget.js", "utf8"),
  );
});

test("unfinished streaks and small totals retain monotonic cumulative semantics", () => {
  for (const total of ["1", "2", "4", "5", "6", "23", "18446744073709551615"]) {
    const events = scenario({ count: total, completed: false }, true);
    assert.equal(events.at(-1).data.repeat_count, total);
    assert.ok(events.every(e => e.data.repeat_end === false));
    assert.ok(events.every((e,i) => !i || BigInt(e.data.repeat_count) > BigInt(events[i-1].data.repeat_count)));
    assert.equal(scenario({count:total},true).at(-1).data.repeat_end,true);
  }
});

test("concurrent engines and repeated stop/reset leave no scheduled timers", () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let id = 0;
  globalThis.setTimeout = fn => {timers.set(++id,fn); return id;};
  globalThis.clearTimeout = id => timers.delete(id);
  try {
    const received=[];
    const a=new ScenarioEngine(e=>received.push(e)), b=new ScenarioEngine(e=>received.push(e));
    a.play(()=>scenario({},true),10,2); b.play(()=>scenario({completed:false},true),10,2);
    assert.equal(timers.size,2);
    while(timers.size){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}
    assert.equal(received.length,12);
    assert.equal(new Set(received.map(e=>e.messageId)).size,12);
    assert.equal(new Set(received.map(e=>e.data.group_id)).size,4);
    for(let i=0;i<10;i++){a.play(()=>scenario({},true));a.reset(()=>{});b.play(()=>scenario({},true));b.stop();assert.equal(timers.size,0);}
  } finally {globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
