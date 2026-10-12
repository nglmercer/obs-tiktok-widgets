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
history.replaceState(null, "", location.pathname);
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
}).then((r) => {
  if (!r.ok)
    throw new ApiError(
      "SESSION_EXPIRED",
      "Reopen Studio from the launcher to authenticate.",
    );
});
export async function call<T = unknown>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  await session;
  const response = await fetch("/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Studio-Session": secret },
    credentials: "same-origin",
    body: JSON.stringify({ method, args }),
  });
  const packet = await response.json();
  if (!packet.ok)
    throw new ApiError(
      packet.error?.code || "API_ERROR",
      packet.error?.message || "Request failed",
      packet.error?.details,
    );
  return packet.data;
}
