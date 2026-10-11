let sequence = 0;
const session = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const uniqueId = () => `${session}-${++sequence}`;
function integer(value) {
  if (!/^\d{1,20}$/.test(value) || BigInt(value) > 18446744073709551615n)
    throw new Error("Use an unsigned 64-bit integer");
  return BigInt(value).toString();
}
function fixture(options = {}, group = uniqueId()) {
  const type = options.type || "gift", count = integer(options.count || "23");
  const user = {
    nickname: options.username ?? "Viewer123",
    unique_id: options.username ?? "Viewer123",
    id: integer(options.userId || "9007199254740993")
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
    gift_id: integer(options.giftId || "5655"),
    gift_name: options.giftName || "Rose",
    repeat_count: count,
    combo_count: count,
    group_id: group,
    repeat_end: options.completed ?? true
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
function scenario(options = {}, streak = false) {
  const group = uniqueId();
  if (streak && BigInt(integer(options.count || "23")) < 5n)
    throw new Error("Streak total must be at least 5");
  return streak && (!options.type || options.type === "gift") ? ["1", "5", options.count || "23"].map(
    (count, i) => fixture({ ...options, count, completed: i === 2 }, group)
  ) : [fixture(options, group)];
}
function dispatchLocal(target, event) {
  target.dispatchEvent(new CustomEvent("tiktok:event", { detail: event }));
  target.dispatchEvent(
    new CustomEvent(`tiktok:${event.type}`, { detail: event })
  );
}
class ScenarioEngine {
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
}
export {
  ScenarioEngine,
  dispatchLocal,
  fixture,
  integer,
  scenario,
  uniqueId
};
