"use strict";
(() => {
  // web/playground/engine.ts
  var sequence = 0;
  var session = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  var uniqueId = () => `${session}-${++sequence}`;
  function integer(value) {
    if (!/^\d{1,20}$/.test(value) || BigInt(value) > 18446744073709551615n)
      throw new Error("Use an unsigned 64-bit integer");
    return BigInt(value).toString();
  }
  function fixture(options2 = {}, group = uniqueId()) {
    const type = options2.type || "gift", count = integer(options2.count || "23");
    const user = {
      nickname: options2.username ?? "Viewer123",
      unique_id: options2.username ?? "Viewer123",
      id: integer(options2.userId || "9007199254740993")
    };
    const methods = {
      gift: "WebcastGiftMessage",
      chat: "WebcastChatMessage",
      like: "WebcastLikeMessage",
      follow: "WebcastSocialMessage",
      roomUser: "WebcastRoomUserSeqMessage"
    };
    const data = type === "gift" ? {
      user,
      gift_id: integer(options2.giftId || "5655"),
      gift_name: options2.giftName || "Rose",
      repeat_count: count,
      combo_count: count,
      group_id: group,
      repeat_end: options2.completed ?? true
    } : type === "chat" ? { user, comment: "Hello from Event Playground" } : type === "like" ? { user, count, total: count } : type === "roomUser" ? { total: count } : { user };
    return {
      version: 1,
      type,
      method: methods[type] || "FixtureMessage",
      synthetic: true,
      room: "@playground",
      messageId: uniqueId(),
      isHistory: false,
      receivedTimestamp: String(Date.now()),
      data
    };
  }
  function scenario(options2 = {}, streak = false) {
    const group = uniqueId();
    if (!streak || options2.type && options2.type !== "gift") return [fixture(options2, group)];
    const total = BigInt(integer(options2.count || "23"));
    if (total < 1n) throw new Error("Streak total must be positive");
    const checkpoints = [1n, 5n, total].filter((n, i, all) => n <= total && all.indexOf(n) === i).sort((a, b) => a < b ? -1 : 1);
    return checkpoints.map((count, i) => fixture({ ...options2, count: String(count), completed: i === checkpoints.length - 1 ? options2.completed ?? true : false }, group));
  }
  var ScenarioEngine = class {
    constructor(emit) {
      this.emit = emit;
      this.generation = 0;
    }
    stop() {
      ++this.generation;
      if (this.timer !== void 0) clearTimeout(this.timer);
      this.timer = void 0;
    }
    reset(clear) {
      this.stop();
      clear();
    }
    play(factory, interval = 600, repetitions = 1) {
      this.stop();
      if (!Number.isFinite(interval) || interval < 0 || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100)
        throw new Error("Invalid scenario timing");
      const token = this.generation;
      const events = Array.from(
        { length: Math.max(1, Math.min(100, repetitions)) },
        factory
      ).flat();
      if (!events.length) return;
      let index = 0;
      const next = () => {
        if (token !== this.generation) return;
        this.timer = void 0;
        this.emit(events[index++]);
        if (index < events.length && token === this.generation)
          this.timer = setTimeout(next, Math.max(0, interval));
      };
      next();
    }
  };

  // web/playground/protocol.ts
  var channel = "tiktok-playground";
  function targetOrigin(url) {
    const parsed = new URL(url);
    return parsed.protocol === "file:" || parsed.origin === "null" ? "*" : parsed.origin;
  }
  function validPacket(value, session3) {
    if (!value || typeof value !== "object" || !session3) return false;
    const p = value;
    try {
      if (JSON.stringify(p).length > 65536) return false;
    } catch {
      return false;
    }
    if (p.channel !== channel || p.session !== session3 || p.version !== 1) return false;
    if (p.action === "updated") return Object.keys(p).length === 4;
    if (p.action === "loaded") return Object.keys(p).length === 4;
    if (p.action === "ready") return Object.keys(p).length === 4 || Object.keys(p).length === 5 && (p.supported === null || Array.isArray(p.supported) && p.supported.length <= 5 && p.supported.every((t) => ["gift", "chat", "like", "follow", "roomUser"].includes(t)));
    if (p.action === "settings") return typeof p.animation === "boolean" && typeof p.sound === "boolean";
    if (p.action === "error") return typeof p.message === "string" && p.message.length <= 512;
    if (p.action !== "event") return false;
    const e = p.event;
    return !!e && e.version === 1 && e.synthetic === true && ["gift", "chat", "like", "follow", "roomUser"].includes(e.type) && typeof e.messageId === "string" && typeof e.room === "string" && typeof e.method === "string" && typeof e.receivedTimestamp === "string" && e.isHistory === false && !!e.data && typeof e.data === "object" && !Array.isArray(e.data) && validData(e);
  }
  function validData(e) {
    const d = e.data;
    const uint = (v) => typeof v === "string" && /^\d{1,20}$/.test(v) && BigInt(v) <= 18446744073709551615n;
    if (e.type !== "roomUser" && (!d.user || typeof d.user !== "object" || !uint(d.user.id) || typeof d.user.nickname !== "string")) return false;
    if (e.type === "gift") return uint(d.gift_id) && uint(d.repeat_count) && uint(d.combo_count) && typeof d.group_id === "string" && typeof d.gift_name === "string" && typeof d.repeat_end === "boolean";
    if (e.type === "like") return uint(d.count) && uint(d.total);
    if (e.type === "roomUser") return uint(d.total);
    return e.type !== "chat" || typeof d.comment === "string";
  }

  // web/playground/app.ts
  if (new URL(location.href).searchParams.get("studio") === "design")
    document.body.classList.add("studio-preview");
  var el = (id) => document.getElementById(id);
  var input = (id) => el(id);
  var frame = el("preview");
  var status = el("status");
  var json = el("json");
  var history = el("history");
  var state = "loading";
  var session2 = "";
  var timeout;
  var last;
  var initialReplay = true;
  var supported = null;
  var origin = targetOrigin(new URL("preview.html", location.href).href);
  var send = (data) => {
    if (state === "closed" || state === "error") return;
    frame.contentWindow?.postMessage(
      { channel, version: 1, session: session2, ...data },
      origin
    );
  };
  var settings = () => send({
    action: "settings",
    animation: input("animation").checked,
    sound: input("sound").checked
  });
  var engine = new ScenarioEngine((event) => {
    if (state !== "ready") return;
    send({ action: "event", event });
    last = event;
    json.textContent = JSON.stringify(event, null, 2);
    const li = document.createElement("li"), b = document.createElement("button");
    b.textContent = `${event.type} \xB7 ${event.messageId} \xB7 ${String(event.data.repeat_count || "")}`;
    b.onclick = () => {
      last = event;
      json.textContent = JSON.stringify(event, null, 2);
    };
    li.append(b);
    history.append(li);
    while (history.children.length > 200) history.firstChild?.remove();
    status.textContent = supported && !supported.includes(event.type) ? `This template or its filters do not display ${event.type} events.` : "Local simulation delivered";
  });
  function options() {
    const count = integer(input("count").value);
    if (BigInt(count) < 1n) throw new Error("Repeat count must be positive");
    return {
      type: input("type").value,
      username: input("username").value,
      userId: input("userId").value,
      giftId: input("giftId").value,
      giftName: input("giftName").value,
      count: String(count),
      completed: input("completed").checked
    };
  }
  function play() {
    try {
      const o = options(), interval = Number(input("interval").value), repetitions = Number(input("repetitions").value);
      if (!Number.isFinite(interval) || interval < 0 || interval > 6e4 || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100)
        throw new Error("Invalid interval or simulation count");
      const speed = Number(input("speed").value);
      if (!Number.isFinite(speed) || speed <= 0)
        throw new Error("Invalid playback speed");
      scenario(o, input("streak").checked);
      if (state !== "ready") return;
      settings();
      engine.play(
        () => scenario(o, input("streak").checked),
        interval / Number(input("speed").value),
        repetitions
      );
    } catch (e) {
      status.textContent = e.message;
    }
  }
  function loadPreview() {
    engine.stop();
    if (timeout !== void 0) clearTimeout(timeout);
    session2 = uniqueId();
    state = "loading";
    el("replay").disabled = true;
    status.textContent = "Loading preview\u2026";
    frame.src = `preview.html?session=${encodeURIComponent(session2)}`;
    timeout = setTimeout(() => {
      state = "error";
      engine.stop();
      timeout = void 0;
      status.textContent = "Preview initialization timed out. Reset to retry.";
    }, 1e4);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || origin !== "*" && e.origin !== origin || !validPacket(e.data, session2))
      return;
    if (e.data.action === "loaded" && state === "loading") {
      state = "initializing";
      settings();
    } else if (e.data.action === "ready" && state === "initializing") {
      state = "ready";
      supported = e.data.supported ?? null;
      clearTimeout(timeout);
      timeout = void 0;
      el("replay").disabled = false;
      status.textContent = "Preview ready. Templates display their supported event types and filters.";
      if (initialReplay) {
        initialReplay = false;
        play();
      }
    } else if (e.data.action === "updated" && state === "ready") {
      initialReplay = false;
      loadPreview();
    } else if (e.data.action === "error" && state === "ready")
      status.textContent = e.data.message;
  });
  frame.onload = () => {
    if (state === "ready") {
      initialReplay = false;
      loadPreview();
    }
  };
  frame.onerror = () => {
    state = "error";
    el("replay").disabled = true;
    engine.stop();
    clearTimeout(timeout);
    status.textContent = "Preview failed to load. Reset to retry.";
  };
  var initialOptions = new URL(location.href).searchParams;
  for (const [key, id] of [
    ["event", "type"],
    ["user", "username"],
    ["gift", "giftName"],
    ["count", "count"]
  ])
    if (initialOptions.has(key)) input(id).value = initialOptions.get(key);
  loadPreview();
  el("replay").onclick = play;
  el("stop").onclick = () => {
    initialReplay = false;
    engine.stop();
    status.textContent = "Stopped";
  };
  el("reset").onclick = () => {
    initialReplay = false;
    last = void 0;
    json.textContent = "";
    history.replaceChildren();
    loadPreview();
  };
  input("range").oninput = () => {
    input("count").value = input("range").value;
  };
  input("count").oninput = () => {
    input("range").value = input("count").value;
  };
  input("gift").onchange = () => {
    if (input("gift").value !== "custom") {
      input("giftId").value = input("gift").value;
      input("giftName").value = el("gift").selectedOptions[0].text;
    }
  };
  for (const id of ["animation", "sound"])
    input(id).onchange = () => {
      if (state === "ready") settings();
    };
  el("copy").onclick = async () => {
    if (!last) return;
    const text = JSON.stringify(last, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "JSON copied";
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
      }
      area.remove();
      status.textContent = copied ? "JSON copied" : "Copy unavailable: select the JSON and copy manually";
    }
  };
  window.addEventListener("pagehide", () => {
    state = "closed";
    session2 = "";
    clearTimeout(timeout);
    engine.stop();
  });
})();
