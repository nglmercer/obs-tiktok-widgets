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
    if (streak && BigInt(integer(options2.count || "23")) < 5n)
      throw new Error("Streak total must be at least 5");
    return streak && (!options2.type || options2.type === "gift") ? ["1", "5", options2.count || "23"].map(
      (count, i) => fixture({ ...options2, count, completed: i === 2 }, group)
    ) : [fixture(options2, group)];
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

  // web/playground/app.ts
  var el = (id) => document.getElementById(id);
  var input = (id) => el(id);
  var frame = el("preview");
  var status = el("status");
  var json = el("json");
  var history = el("history");
  var ready = false;
  var last;
  var pending = false;
  var send = (data) => frame.contentWindow?.postMessage(
    { channel: "tiktok-playground", ...data },
    "*"
  );
  var settings = () => send({
    action: "settings",
    animation: input("animation").checked,
    sound: input("sound").checked
  });
  var engine = new ScenarioEngine((event) => {
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
    status.textContent = "Local simulation delivered";
  });
  function options() {
    const count = Number(input("count").value);
    if (!Number.isInteger(count) || count < 1 || count > 1e6)
      throw new Error("Repeat count must be between 1 and 1,000,000");
    if (input("streak").checked && count < 5)
      throw new Error("Streak total must be at least 5");
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
      scenario(o, input("streak").checked);
      if (!ready) {
        pending = true;
        return;
      }
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
  window.addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || e.data?.channel !== "tiktok-playground")
      return;
    if (e.data.action === "loaded") settings();
    if (e.data.action === "ready") {
      ready = true;
      el("replay").disabled = false;
      if (pending) {
        pending = false;
        play();
      }
    }
  });
  el("replay").disabled = true;
  pending = true;
  frame.src = "preview.html";
  el("replay").onclick = play;
  el("stop").onclick = () => {
    pending = false;
    engine.stop();
    status.textContent = "Stopped";
  };
  el("reset").onclick = () => engine.reset(() => {
    pending = false;
    ready = false;
    last = void 0;
    json.textContent = "";
    history.replaceChildren();
    el("replay").disabled = true;
    frame.src = "preview.html";
    status.textContent = "Reset";
  });
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
  for (const id of ["animation", "sound"]) input(id).onchange = settings;
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
      const copied = document.execCommand("copy");
      area.remove();
      status.textContent = copied ? "JSON copied" : "Copy unavailable: select the JSON and copy manually";
    }
  };
  window.addEventListener("pagehide", () => engine.stop());
})();
