export interface Project {
  id: string;
  revision: string;
  settings: Record<string, unknown>;
  template: { id: string; version: string };
  events: string[];
  entry: string;
  build?: { mode: string; framework: string };
  autoPublish: boolean;
  diagnostic?: unknown;
}
export interface Template {
  id: string;
  version: string;
  name: string;
  description: string;
  category: string;
  thumbnail?: string;
  build?: { mode: string; framework: string };
  events: string[];
}
export const requestedWidget = new URL(location.href).searchParams.get(
  "widget",
);
let secret = location.hash.slice(1);
history.replaceState(null, "", location.pathname + location.search);
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
const session = fetch("/session", {
  method: "POST",
  body: secret,
  credentials: "same-origin",
}).then(async (r) => {
  if (!r.ok)
    throw new ApiError(
      "SESSION_EXPIRED",
      "Reopen Studio from the launcher to authenticate.",
    );
  const packet = await r.json();
  if (typeof packet.session !== "string" || packet.session.length > 256)
    throw new ApiError("SESSION_EXPIRED", "Invalid Studio session.");
  secret = packet.session;
});
export async function call<T = unknown>(
  method: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  await session;
  const response = await fetch("/api", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "X-Studio-Session": secret },
    credentials: "same-origin",
    body: JSON.stringify({ method, args }),
  });
  let packet;
  try {
    packet = await response.json();
  } catch {
    throw new ApiError(
      "HTTP_ERROR",
      `Studio request failed (${response.status}).`,
    );
  }
  if (packet.apiVersion !== 1 || typeof packet.ok !== "boolean")
    throw new ApiError("INVALID_RESPONSE", "Unsupported Studio API response.");
  if (!packet.ok)
    throw new ApiError(
      packet.error?.code || "API_ERROR",
      packet.error?.message || "Request failed",
      packet.error?.details,
    );
  if (!response.ok)
    throw new ApiError(
      "HTTP_ERROR",
      `Studio request failed (${response.status}).`,
    );
  return packet.data;
}
