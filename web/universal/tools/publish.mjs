#!/usr/bin/env node
// External producer example. Node is not used by the OBS plugin itself.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { validateEvent } from "../index.js";
import { receiverAddress } from "../transport.js";
const token = process.env.OBS_EVENT_TOKEN;
if (!token)
  throw new Error("Set OBS_EVENT_TOKEN from your paired producer credential");
const address = receiverAddress(
  process.env.OBS_EVENT_ADDRESS || "http://127.0.0.1:17453",
);
const event = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : {
      version: 1,
      id: randomUUID(),
      source: "external.cli",
      type: "custom.alert",
      timestamp: new Date().toISOString(),
      data: {
        title: "Hello from a separate application",
        message: "TikTools is not required",
      },
    };
validateEvent(event);
const response = await fetch(address + "/v1/events", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(event),
  signal: AbortSignal.timeout(5000),
});
console.log(
  JSON.stringify({ status: response.status, ...(await response.json()) }),
);
if (!response.ok) process.exitCode = 1;
