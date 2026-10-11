"use strict";
var TikTokOBSSDK = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // web/sdk/index.ts
  var index_exports = {};
  __export(index_exports, {
    CONTRACT_VERSION: () => CONTRACT_VERSION,
    TikTokOBS: () => TikTokOBS,
    TikTokOBSClient: () => TikTokOBSClient
  });

  // web/sdk/types.ts
  var CONTRACT_VERSION = 1;

  // web/sdk/client.ts
  var TikTokOBSClient = class {
    constructor(target = window) {
      this.target = target;
      this.listeners = /* @__PURE__ */ new Map();
      this.lastState = null;
      this.on("state", (event) => {
        this.lastState = event;
      });
    }
    on(type, callback) {
      const channel = type === "*" ? "tiktok:event" : `tiktok:${type}`;
      let map = this.listeners.get(type);
      if (!map) {
        map = /* @__PURE__ */ new Map();
        this.listeners.set(type, map);
      }
      if (!map.has(callback)) {
        const listener = (event) => {
          const e = event.detail;
          if (e?.version === 1) callback(e);
        };
        map.set(callback, listener);
        this.target.addEventListener(channel, listener);
      }
      return () => this.off(type, callback);
    }
    once(type, callback) {
      let remove = () => {
      };
      remove = this.on(type, (event) => {
        remove();
        callback(event);
      });
      return remove;
    }
    off(type, callback) {
      const map = this.listeners.get(type), listener = map?.get(callback);
      if (listener) {
        this.target.removeEventListener(type === "*" ? "tiktok:event" : `tiktok:${type}`, listener);
        map.delete(callback);
      }
    }
    onAny(callback) {
      return this.on("*", callback);
    }
    getLastState() {
      return this.lastState;
    }
    destroy() {
      for (const [type, map] of this.listeners) for (const callback of map.keys()) this.off(type, callback);
      this.listeners.clear();
      this.lastState = null;
    }
  };
  var TikTokOBS = new TikTokOBSClient();
  return __toCommonJS(index_exports);
})();
